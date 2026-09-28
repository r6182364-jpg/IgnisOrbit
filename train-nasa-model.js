const fs = require('node:fs/promises');
const path = require('node:path');

const dataDirectory = path.join(__dirname, '..', 'data', 'nasa');
const categories = ['silicone', 'fibrous', 'polymer', 'mixed', 'other'];
const featureNames = ['bias', 'oxygenFraction', 'airFlowFraction', 'concurrentFlow', ...categories.map((name) => `material_${name}`)];

function parseCsv(text) {
	const records = [];
	let record = [];
	let cell = '';
	let quoted = false;
	for (let index = 0; index < text.length; index += 1) {
		const character = text[index];
		if (quoted && character === '"' && text[index + 1] === '"') {
			cell += '"';
			index += 1;
		} else if (character === '"') {
			quoted = !quoted;
		} else if (character === ',' && !quoted) {
			record.push(cell.trim());
			cell = '';
		} else if ((character === '\n' || character === '\r') && !quoted) {
			if (character === '\r' && text[index + 1] === '\n') index += 1;
			record.push(cell.trim());
			if (record.some(Boolean)) records.push(record);
			record = [];
			cell = '';
		} else {
			cell += character;
		}
	}
	if (cell || record.length) {
		record.push(cell.trim());
		if (record.some(Boolean)) records.push(record);
	}
	return records;
}

function numberValues(value) {
	return [...String(value).matchAll(/\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
}

function averageNumbers(value) {
	const values = numberValues(value);
	return values.length ? values.reduce((sum, number) => sum + number, 0) / values.length : null;
}

function columnIndex(headers, phrase) {
	return headers.findIndex((header) => header.toLowerCase().includes(phrase));
}

function classifyMaterial(material) {
	const value = material.toLowerCase();
	if (value.includes('silicone')) return 'silicone';
	if (/sibal|cotton|fiberglass/.test(value)) return 'fibrous';
	if (value.includes('&')) return 'mixed';
	if (value.includes('pmma') || value.includes('nomex')) return 'polymer';
	return 'other';
}

function toTrainingRows(csv, investigationId) {
	const parsed = parseCsv(csv);
	const headers = parsed[0];
	const sampleIndex = columnIndex(headers, 'sample number');
	const materialIndex = columnIndex(headers, 'material');
	const oxygenIndex = columnIndex(headers, 'percent o2');
	const flowIndex = columnIndex(headers, 'air flow');
	const directionIndex = headers.findIndex((header) => /flow direction|^direction\s*$/i.test(header));
	const burnIndex = columnIndex(headers, 'burn time');
	if ([sampleIndex, materialIndex, oxygenIndex, flowIndex, directionIndex, burnIndex].some((index) => index < 0)) {
		throw new Error(`${investigationId} is missing a required experimental-table column`);
	}

	return parsed.slice(1).flatMap((cells) => {
		const sampleId = cells[sampleIndex] || '';
		if (!/^(?:S\d+|\d+-\d+)$/i.test(sampleId)) return [];
		const burnText = (cells[burnIndex] || '').trim();
		const burnDurationSeconds = averageNumbers(burnText);
		if (/insignificant/i.test(burnText)) {
			return [{ investigationId, sampleId, material: cells[materialIndex] || 'Not reported', oxygenPercent: averageNumbers(cells[oxygenIndex]), airFlowCmS: averageNumbers(cells[flowIndex]), flowDirection: cells[directionIndex] || '', burnDurationSeconds: null, sustainedBurn: 0 }];
		}
		if (burnDurationSeconds === null) return [];
		return [{ investigationId, sampleId, material: cells[materialIndex] || 'Not reported', oxygenPercent: averageNumbers(cells[oxygenIndex]), airFlowCmS: averageNumbers(cells[flowIndex]), flowDirection: cells[directionIndex] || '', burnDurationSeconds, sustainedBurn: 1 }];
	});
}

function encodeFeatures(row) {
	const materialClass = classifyMaterial(row.material);
	return [
		1,
		(row.oxygenPercent ?? 21) / 30,
		(row.airFlowCmS ?? 0) / 40,
		/concurrent/i.test(row.flowDirection) ? 1 : 0,
		...categories.map((category) => Number(materialClass === category))
	];
}

function sigmoid(value) {
	if (value > 30) return 1;
	if (value < -30) return 0;
	return 1 / (1 + Math.exp(-value));
}

function dot(left, right) {
	return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

function fitLogisticRegression(rows) {
	const weights = Array(featureNames.length).fill(0);
	const positiveRate = rows.reduce((sum, row) => sum + row.sustainedBurn, 0) / rows.length;
	weights[0] = Math.log(positiveRate / (1 - positiveRate));
	const learningRate = 0.22;
	const regularization = 0.04;
	for (let iteration = 0; iteration < 4500; iteration += 1) {
		const gradient = Array(featureNames.length).fill(0);
		for (const row of rows) {
			const features = encodeFeatures(row);
			const error = sigmoid(dot(weights, features)) - row.sustainedBurn;
			features.forEach((feature, index) => { gradient[index] += error * feature / rows.length; });
		}
		for (let index = 1; index < weights.length; index += 1) gradient[index] += regularization * weights[index];
		weights.forEach((weight, index) => { weights[index] = weight - learningRate * gradient[index]; });
	}
	return weights;
}

function crossValidate(rows) {
	const predictions = rows.map((heldOut, heldOutIndex) => {
		const trainingRows = rows.filter((_, index) => index !== heldOutIndex);
		const weights = fitLogisticRegression(trainingRows);
		return { actual: heldOut.sustainedBurn, predicted: Number(sigmoid(dot(weights, encodeFeatures(heldOut))) >= 0.5) };
	});
	const correct = predictions.filter((prediction) => prediction.actual === prediction.predicted).length;
	const recallByClass = [0, 1].map((classLabel) => {
		const classPredictions = predictions.filter((prediction) => prediction.actual === classLabel);
		return classPredictions.length ? classPredictions.filter((prediction) => prediction.predicted === classLabel).length / classPredictions.length : 0;
	});
	return {
		method: 'leave-one-out cross-validation',
		accuracy: Number((correct / predictions.length).toFixed(3)),
		balancedAccuracy: Number(((recallByClass[0] + recallByClass[1]) / 2).toFixed(3)),
		correct: `${correct}/${predictions.length}`
	};
}

async function main() {
	const manifestText = (await fs.readFile(path.join(dataDirectory, 'manifest.json'), 'utf8')).replace(/^\uFEFF/, '');
	const manifest = JSON.parse(manifestText);
	const fireInvestigationIds = ['PSI-98', 'PSI-99'];
	const rows = [];
	for (const id of fireInvestigationIds) {
		const source = manifest.find((entry) => entry.investigationId === id);
		if (!source) throw new Error(`NASA source ${id} is missing from the manifest`);
		const csv = await fs.readFile(path.join(dataDirectory, source.file), 'utf8');
		rows.push(...toTrainingRows(csv, id));
	}
	const positives = rows.filter((row) => row.sustainedBurn === 1).length;
	const negatives = rows.length - positives;
	if (rows.length < 6 || positives === 0 || negatives === 0) throw new Error('Too few labeled NASA trials to train and validate this prototype.');

	const model = {
		name: 'SpaceFire historical SAFFIRE comparator',
		version: 1,
		algorithm: 'L2-regularized logistic regression',
		target: 'NASA table records a measurable burn duration rather than "Insignificant"',
		featureNames,
		weights: fitLogisticRegression(rows),
		training: { sampleCount: rows.length, positiveCases: positives, insignificantCases: negatives, sources: fireInvestigationIds, validation: crossValidate(rows) },
		limitations: 'Small historical case table. This estimates a recorded sustained-burn outcome for similar SAFFIRE tests; it is not a spacecraft fire-spread simulator or a certified safety prediction.',
		cases: rows.map((row) => ({ ...row, materialClass: classifyMaterial(row.material) })),
		sources: manifest.filter((entry) => ['PSI-98', 'PSI-99', 'PSI-100'].includes(entry.investigationId))
	};
	const generated = `window.spaceFireNASAmodel = ${JSON.stringify(model, null, 2)};\n`;
	await fs.writeFile(path.join(dataDirectory, 'model.js'), generated, 'utf8');
	console.log(`Trained on ${rows.length} NASA SAFFIRE burn trials (${positives} sustained, ${negatives} insignificant).`);
	console.log(`Leave-one-out balanced accuracy: ${(model.training.validation.balancedAccuracy * 100).toFixed(1)}% (${model.training.validation.correct}).`);
	console.log(`Saved browser model to data/nasa/model.js.`);
}

main().catch((error) => {
	console.error(`NASA model training failed: ${error.message}`);
	process.exitCode = 1;
});