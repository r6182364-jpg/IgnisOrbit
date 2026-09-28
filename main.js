const scenarioData = {
	battery: { origin: 'battery' },
	electronics: { origin: 'electronics' },
	materials: { origin: 'materials' }
};

const elements = {
	risk: document.querySelector('#riskValue'), riskLabel: document.querySelector('#riskLabel'), meter: document.querySelector('#riskMeter'),
	oxygen: document.querySelector('#oxygenLevel'), oxygenOutput: document.querySelector('#oxygenOutput'),
	environment: document.querySelector('#environment'), material: document.querySelector('#material'),
	map: document.querySelector('#stationMap'), run: document.querySelector('#simulateButton'), confidence: document.querySelector('#confidenceValue'),
	title: document.querySelector('#trajectoryTitle'), text: document.querySelector('#trajectoryText'), toast: document.querySelector('#toast')
};

let selectedScenario = 'battery';
let toastTimeout;
const nasaModel = window.spaceFireNASAmodel;
const materialClasses = { sibal: 'fibrous', silicone: 'silicone', pmma: 'polymer' };
const elementsFlow = document.querySelector('#flowDirection');

function showToast(message) {
	elements.toast.textContent = message;
	elements.toast.classList.add('visible');
	clearTimeout(toastTimeout);
	toastTimeout = setTimeout(() => elements.toast.classList.remove('visible'), 2400);
}

function calculateRisk() {
	if (!nasaModel) throw new Error('لم يُحمّل نموذج تجارب ناسا. أعد تحميل الصفحة.');
	const materialClass = materialClasses[elements.material.value];
	const selectedOxygen = Number(elements.oxygen.value);
	const selectedFlow = Number(document.querySelector('#airFlow').value);
	const observedOxygen = nasaModel.cases.map((row) => row.oxygenPercent).filter(Number.isFinite);
	const observedFlow = nasaModel.cases.map((row) => row.airFlowCmS).filter(Number.isFinite);
	if (!observedOxygen.length || !observedFlow.length || !materialClass) return null;
	if (selectedOxygen < Math.min(...observedOxygen) || selectedOxygen > Math.max(...observedOxygen)) return null;
	if (selectedFlow < Math.min(...observedFlow) || selectedFlow > Math.max(...observedFlow)) return null;
	const features = nasaModel.featureNames.map((name) => {
		if (name === 'bias') return 1;
		if (name === 'oxygenFraction') return selectedOxygen / 30;
		if (name === 'airFlowFraction') return selectedFlow / 40;
		if (name === 'concurrentFlow') return elementsFlow.value === 'Concurrent' ? 1 : 0;
		return Number(name === `material_${materialClass}`);
	});
	const score = features.reduce((sum, feature, index) => sum + feature * nasaModel.weights[index], 0);
	return Math.round((1 / (1 + Math.exp(-score))) * 100);
}

function updateRisk(risk) {
	if (risk === null) {
		elements.risk.textContent = '—';
		elements.riskLabel.className = 'tag tag-medium';
		elements.riskLabel.textContent = 'خارج نطاق البيانات';
		elements.meter.style.width = '0%';
		elements.meter.style.background = '#d99a45';
		elements.confidence.textContent = '11 حالة فقط';
		document.querySelector('#trackProgress').style.width = '0';
		document.querySelector('#timeline').classList.remove('active');
		return;
	}
	elements.risk.textContent = String(risk).padStart(2, '0');
	elements.meter.style.width = `${risk}%`;
	elements.meter.style.background = risk >= 60 ? '#c44c3b' : risk >= 35 ? '#d99a45' : '#64a983';
	elements.riskLabel.className = `tag ${risk >= 60 ? 'tag-high' : risk >= 35 ? 'tag-medium' : 'tag-low'}`;
	elements.riskLabel.textContent = risk >= 60 ? 'توافق أعلى' : risk >= 35 ? 'توافق متوسط' : 'توافق أقل';
	elements.confidence.textContent = `${nasaModel.training.sampleCount} حالة تدريب`;
	const progress = risk >= 60 ? 82 : risk >= 35 ? 57 : 24;
	document.querySelector('#trackProgress').style.width = `${progress}%`;
	document.querySelector('#timeline').classList.add('active');
}

function updateTrajectory() {
	const risk = calculateRisk();
	const scenario = scenarioData[selectedScenario];
	const materialClass = materialClasses[elements.material.value];
	const selectedOxygen = Number(elements.oxygen.value);
	const selectedFlow = Number(document.querySelector('#airFlow').value);
	const nearestCase = [...nasaModel.cases].sort((left, right) => {
		const distance = (item) => Math.abs((item.oxygenPercent ?? selectedOxygen) - selectedOxygen) / 2
			+ Math.abs((item.airFlowCmS ?? selectedFlow) - selectedFlow) / 20
			+ (item.materialClass === materialClass ? 0 : 2)
			+ (/concurrent/i.test(item.flowDirection) === (elementsFlow.value === 'Concurrent') ? 0 : 0.25);
		return distance(left) - distance(right);
	})[0];
	updateRisk(risk);
	document.querySelector('#sceneOxygen').textContent = `${selectedOxygen.toFixed(1)}%`;
	document.querySelector('#sceneAirFlow').textContent = `${selectedFlow} cm/s`;
	if (risk === null) {
		elements.map.classList.remove('has-prediction', 'source-battery', 'source-electronics', 'source-materials');
		elements.title.textContent = `لا توجد نتيجة مدرّبة عند تدفق ${selectedFlow} cm/s`;
		elements.text.textContent = 'SAFFIRE-III سجّل هذا التدفق، لكن الجدول المنشور لا يتضمن نتيجة احتراق قابلة للتدريب. لا نعرض مؤشرًا خارج نطاق النتائج.';
		for (const id of ['stepNow', 'stepFour', 'stepNine']) document.querySelector(`#${id}`).textContent = '—';
		document.querySelector('#stepFifteen').textContent = 'SAFFIRE-III';
		document.querySelector('#impactValue').textContent = '—';
		window.spaceFireTwin3D?.clearFire();
		return null;
	}
	elements.map.classList.remove('source-battery', 'source-electronics', 'source-materials');
	elements.map.classList.add('has-prediction', `source-${scenario.origin}`);
	elements.title.textContent = `مؤشر توافق مع احتراق مستمر: ${risk}%`;
	elements.text.textContent = `درجة النموذج ليست احتمالًا معايرًا؛ تقارن شروطك بـ${nasaModel.training.sampleCount} نتيجة منشورة من NASA SAFFIRE-I وII. أقرب سجل: ${nearestCase.investigationId} / ${nearestCase.sampleId}.`;
	document.querySelector('#stepNow').textContent = nearestCase.sustainedBurn ? 'احتراق مسجّل' : 'غير ملحوظ في الاختبار';
	document.querySelector('#stepFour').textContent = nearestCase.material;
	document.querySelector('#stepNine').textContent = nearestCase.burnDurationSeconds === null ? 'غير ملحوظة' : `${nearestCase.burnDurationSeconds} ثانية`;
	document.querySelector('#stepFifteen').textContent = nearestCase.investigationId;
	document.querySelector('#impactValue').textContent = `${risk}%`;
	window.spaceFireTwin3D?.setFire(scenario.origin, risk);
	return risk;
}

function runSimulation() {
	elements.run.disabled = true;
	elements.run.querySelector('span:nth-child(2)').textContent = 'جارٍ مقارنة النتائج…';
	elements.map.classList.remove('has-prediction');
	window.setTimeout(() => {
		const risk = updateTrajectory();
		elements.run.disabled = false;
		elements.run.querySelector('span:nth-child(2)').textContent = 'إعادة المقارنة';
		showToast(risk === null ? 'لا توجد نتائج تدريبية لهذا التدفق' : `اكتملت المقارنة التاريخية · مؤشر ${risk}%`);
	}, 650);
}

document.querySelectorAll('.scenario-option').forEach((button) => {
	button.addEventListener('click', () => {
		selectedScenario = button.dataset.scenario;
		document.querySelectorAll('.scenario-option').forEach((option) => {
			const selected = option === button;
			option.classList.toggle('selected', selected);
			option.setAttribute('aria-pressed', String(selected));
		});
		document.querySelectorAll('.hotspot').forEach((hotspot) => {
			const selected = hotspot.dataset.module === selectedScenario;
			hotspot.setAttribute('aria-pressed', String(selected));
		});
		elements.map.classList.remove('has-prediction');
	});
});

document.querySelectorAll('.hotspot').forEach((hotspot) => {
	hotspot.addEventListener('click', () => {
		if (hotspot.dataset.module === 'oxygen') {
			showToast('خط الأكسجين عنصر بصري، وليس مدخلًا في نموذج SAFFIRE');
			return;
		}
		const scenarioKey = hotspot.dataset.module === 'battery' ? 'battery' : hotspot.dataset.module === 'electronics' ? 'electronics' : 'materials';
		document.querySelector(`[data-scenario="${scenarioKey}"]`).click();
		showToast('تم تغيير موضع الإبراز في التوأم التوضيحي');
	});
});

elements.oxygen.addEventListener('input', () => {
	elements.oxygenOutput.textContent = elements.oxygen.value;
	elements.map.classList.remove('has-prediction');
});
document.querySelector('#airFlow').addEventListener('input', (event) => {
	document.querySelector('#airFlowOutput').textContent = event.target.value;
	document.querySelector('#sceneAirFlow').textContent = `${event.target.value} cm/s`;
	elements.map.classList.remove('has-prediction');
});
elements.material.addEventListener('change', () => elements.map.classList.remove('has-prediction'));
elementsFlow.addEventListener('change', () => elements.map.classList.remove('has-prediction'));
elements.environment.addEventListener('change', () => {
	const labels = { station: 'REFERENCE CABIN', vehicle: 'VIRTUAL VEHICLE', lab: 'VIRTUAL LAB' };
	document.querySelector('#sceneEnvironment').textContent = labels[elements.environment.value];
	window.spaceFireTwin3D?.setEnvironment(elements.environment.value);
	elements.map.classList.remove('has-prediction');
});
elements.run.addEventListener('click', runSimulation);

document.querySelectorAll('.apply-recommendation').forEach((button) => {
	button.addEventListener('click', () => {
		const material = button.dataset.material;
		elements.material.value = material;
		document.querySelectorAll('.apply-recommendation').forEach((item) => item.classList.toggle('applied', item === button));
		elements.map.classList.remove('has-prediction');
		showToast('تم اختيار مادة من تجارب SAFFIRE للمقارنة');
	});
});

document.querySelector('#resetButton').addEventListener('click', () => {
	selectedScenario = 'battery';
	elements.oxygen.value = '21.5';
	elements.oxygenOutput.textContent = '21.5';
	document.querySelector('#airFlow').value = '20';
	document.querySelector('#airFlowOutput').textContent = '20';
	elements.material.value = 'sibal';
	elementsFlow.value = 'Concurrent';
		elements.environment.value = 'station';
		document.querySelector('#sceneEnvironment').textContent = 'REFERENCE CABIN';
		window.spaceFireTwin3D?.setEnvironment('station');
	document.querySelectorAll('.scenario-option').forEach((option) => {
		const selected = option.dataset.scenario === selectedScenario;
		option.classList.toggle('selected', selected);
		option.setAttribute('aria-pressed', String(selected));
	});
		document.querySelectorAll('.hotspot').forEach((hotspot) => hotspot.setAttribute('aria-pressed', String(hotspot.dataset.module === 'battery')));
	document.querySelectorAll('.apply-recommendation').forEach((button) => {
		button.classList.remove('applied');
		button.textContent = '＋';
	});
	document.querySelector('#recommendationCount').textContent = '02';
	document.querySelector('#impactValue').textContent = '—';
	elements.map.className = 'station-map';
		elements.risk.textContent = '—';
		elements.riskLabel.className = 'tag tag-low';
		elements.riskLabel.textContent = 'بانتظار المقارنة';
		elements.meter.style.width = '0%';
		elements.confidence.textContent = `${nasaModel.training.sampleCount} حالة تدريب`;
	elements.title.textContent = 'جاهز لمقارنة شروط الاختبار';
	elements.text.textContent = 'غيّر مدخلات SAFFIRE ثم شغّل المقارنة. المؤشر يعبّر عن توافق الشروط مع نتائج الاحتراق المستمر المسجلة، وليس احتمال حريق بالمحطة.';
	for (const id of ['stepNow', 'stepFour', 'stepNine']) document.querySelector(`#${id}`).textContent = '—';
	document.querySelector('#stepFifteen').textContent = 'NASA PSI';
	document.querySelector('#trackProgress').style.width = '0';
	document.querySelector('#timeline').classList.remove('active');
	window.spaceFireTwin3D?.clearFire();
		elements.run.querySelector('span:nth-child(2)').textContent = 'مقارنة بالتجارب';
	showToast('أعيد ضبط المقارنة إلى شروط SAFFIRE-I/II');
});

if (nasaModel) {
	document.querySelector('#trainingCount').textContent = String(nasaModel.training.sampleCount).padStart(2, '0');
	document.querySelector('#modelDataStatus').textContent = `SAFFIRE I–II · ${nasaModel.training.positiveCases} احتراق مستمر / ${nasaModel.training.insignificantCases} غير ملحوظ`;
}
