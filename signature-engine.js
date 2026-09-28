const telemetryInput = document.querySelector('#telemetryFile');
const cameraInput = document.querySelector('#cameraFiles');
const buildSignatureButton = document.querySelector('#buildSignatureButton');
const signatureState = document.querySelector('#signatureState');
const signatureCanvas = document.querySelector('#signatureChart');
const signatureOutput = document.querySelector('#signatureOutput');
const signatureEmpty = document.querySelector('#signatureEmpty');

const channelDefinitions = [
  { key: 'temperature', label: 'Temperature', aliases: [/temperature/, /thermocouple/, /\btc\s*\d*/i, /temp\s*\d*/] },
  { key: 'pressure', label: 'Pressure', aliases: [/pressure/, /press\s*\d*/, /\bkpa\b/, /\bpsia\b/] },
  { key: 'oxygen', label: 'O₂', aliases: [/oxygen/, /(^|[^a-z])o2([^a-z]|$)/] },
  { key: 'carbonDioxide', label: 'CO₂', aliases: [/carbon.?dioxide/, /(^|[^a-z])co2([^a-z]|$)/] },
  { key: 'airFlow', label: 'Air flow', aliases: [/air.?flow/, /air.?velocity/, /anemometer/, /flow.?velocity/] }
];

const seriesColors = {
  temperature: '#d96f4f', pressure: '#638a9a', oxygen: '#4b986d', carbonDioxide: '#c58a45',
  airFlow: '#7970a0', flameArea: '#e46e45', flameExtent: '#bf835c', flameBrightness: '#d4a83c'
};

let lastSignature = null;

function setSignatureStatus(message, state = '') {
  signatureState.textContent = message;
  signatureState.parentElement.classList.toggle('is-working', state === 'working');
  signatureState.parentElement.classList.toggle('is-ready', state === 'ready');
}

function parseCsv(text) {
  const records = [];
  let cells = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"' && quoted && text[index + 1] === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === ',' && !quoted) {
      cells.push(value.trim());
      value = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      cells.push(value.trim());
      if (cells.some(Boolean)) records.push(cells);
      cells = [];
      value = '';
    } else {
      value += character;
    }
  }
  if (value || cells.length) {
    cells.push(value.trim());
    if (cells.some(Boolean)) records.push(cells);
  }
  return records;
}

function normalizeHeader(value) {
  return String(value ?? '').toLowerCase().replace(/[°º]/g, '').replace(/[^a-z0-9₂₃]+/g, ' ').trim();
}

function getChannelForHeader(header) {
  const normalized = normalizeHeader(header);
  return channelDefinitions.find((channel) => channel.aliases.some((alias) => alias.test(normalized)))?.key;
}

function parseNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value === null || value === undefined || value === '') return null;
  const text = String(value).trim().replace(/,/g, '');
  const match = text.match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i);
  if (!match) return null;
  const number = Number(match[0]);
  return Number.isFinite(number) ? number : null;
}

function parseTime(value, fallbackIndex) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime() / 1000;
  const text = String(value ?? '').trim();
  const clock = text.match(/^(\d+):([0-5]?\d(?:\.\d+)?)$/);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  return parseNumber(text) ?? fallbackIndex;
}

function chooseHeaderRow(rows) {
  let choice = { index: -1, score: 0 };
  for (let index = 0; index < Math.min(rows.length, 50); index += 1) {
    const cells = rows[index] || [];
    const text = cells.map(normalizeHeader);
    const channelHits = channelDefinitions.filter((channel) => text.some((header) => channel.aliases.some((alias) => alias.test(header)))).length;
    const timeHit = text.some((header) => /(^| )(time|elapsed|seconds|second|sec|mission time|timestamp)( |$)/.test(header));
    const score = channelHits * 2 + Number(timeHit);
    if (score > choice.score) choice = { index, score };
  }
  return choice.score >= 2 ? choice.index : -1;
}

function parseTelemetryRows(rows, sourceName) {
  const headerIndex = chooseHeaderRow(rows);
  if (headerIndex < 0) throw new Error('ما لقيت صف عناوين مناسب. نحتاج أعمدة وقتًا وقناة حساسات واحدة على الأقل.');
  const headers = rows[headerIndex].map((header) => String(header ?? '').trim());
  const channelColumns = {};
  const channelHeaders = {};
  let timeColumn = -1;
  headers.forEach((header, index) => {
    const channel = getChannelForHeader(header);
    if (channel && channelColumns[channel] === undefined) {
      channelColumns[channel] = index;
      channelHeaders[channel] = header;
    }
    if (timeColumn < 0 && /(^| )(time|elapsed|seconds|second|sec|mission time|timestamp)( |$)/.test(normalizeHeader(header))) timeColumn = index;
  });
  if (!Object.keys(channelColumns).length) throw new Error('ما تعرفت على أعمدة الحساسات في الملف.');

  let samples = rows.slice(headerIndex + 1).flatMap((row, index) => {
    const values = {};
    for (const [channel, column] of Object.entries(channelColumns)) values[channel] = parseNumber(row[column]);
    if (!Object.values(values).some(Number.isFinite)) return [];
    return [{ rawTime: timeColumn < 0 ? index : parseTime(row[timeColumn], index), values }];
  });
  if (samples.length < 2) throw new Error('الملف يحتاج صفّين قياسيين على الأقل لبناء بصمة زمنية.');

  const rawTimes = samples.map((sample) => sample.rawTime);
  const minimum = rawTimes.reduce((value, time) => Math.min(value, time), Infinity);
  const maximum = rawTimes.reduce((value, time) => Math.max(value, time), -Infinity);
  const range = maximum - minimum;
  samples = samples.map((sample, index) => ({
    progress: range > 0 ? ((sample.rawTime - minimum) / range) * 100 : (index / (samples.length - 1)) * 100,
    values: sample.values
  }));
  return { samples, channels: Object.keys(channelColumns), channelHeaders, sourceName, rowCount: samples.length, hasSourceTime: timeColumn >= 0 };
}

async function readTelemetryFile(file) {
  const extension = file.name.split('.').pop().toLowerCase();
  let rows;
  if (extension === 'csv') {
    rows = parseCsv(await file.text());
  } else if (['xlsx', 'xls'].includes(extension)) {
    if (!window.XLSX) throw new Error('مكتبة قراءة Excel لم تُحمّل. تحقق من اتصال الإنترنت وأعد تحميل الصفحة.');
    const workbook = window.XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    let best = { rows: [], score: 0 };
    for (const sheetName of workbook.SheetNames) {
      const sheetRows = window.XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: true, defval: null });
      const headerIndex = chooseHeaderRow(sheetRows);
      if (headerIndex < 0) continue;
      const headers = sheetRows[headerIndex].map((header) => String(header ?? ''));
      const hits = headers.filter((header) => getChannelForHeader(header)).length;
      if (hits > best.score) best = { rows: sheetRows, score: hits };
    }
    if (!best.rows.length) throw new Error('ما لقيت ورقة Excel فيها عناوين حساسات معروفة.');
    rows = best.rows;
  } else {
    throw new Error('صيغة telemetry المدعومة هي CSV أو XLSX أو XLS.');
  }
  return parseTelemetryRows(rows, file.name);
}

function isWarmFlamePixel(red, green, blue) {
  return red > 105 && green > 42 && blue < 205 && red - green > 16 && green - blue > 7 && red > green * 1.12;
}

function measureFlameFrame(imageData, width, height, progress, source) {
  const pixels = imageData.data;
  const stride = 2;
  let considered = 0;
  let warmPixels = 0;
  let brightnessTotal = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let weightedX = 0;
  let weightedY = 0;
  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const offset = (y * width + x) * 4;
      const red = pixels[offset];
      const green = pixels[offset + 1];
      const blue = pixels[offset + 2];
      considered += 1;
      if (!isWarmFlamePixel(red, green, blue)) continue;
      warmPixels += 1;
      brightnessTotal += 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      weightedX += x;
      weightedY += y;
    }
  }
  const hasWarmRegion = warmPixels >= 3;
  const boundsWidth = hasWarmRegion ? maxX - minX + 1 : 0;
  const boundsHeight = hasWarmRegion ? maxY - minY + 1 : 0;
  return {
    progress,
    warmPixelAreaPercent: considered ? warmPixels / considered * 100 : 0,
    flameExtentPercent: hasWarmRegion ? Math.max(boundsWidth / width, boundsHeight / height) * 100 : 0,
    flameBrightness: warmPixels ? brightnessTotal / warmPixels : 0,
    centroidX: warmPixels ? weightedX / warmPixels / width : 0,
    centroidY: warmPixels ? weightedY / warmPixels / height : 0,
    source
  };
}

function createAnalysisCanvas(width, height, source) {
  const maximumSide = 360;
  const scale = Math.min(1, maximumSide / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return { canvas, context };
}

async function decodeImage(file) {
  if ('createImageBitmap' in window) return createImageBitmap(file);
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function analyzeImageFiles(files, progressCallback) {
  let imageFiles = files.filter((file) => /\.(jpe?g|png|webp|bmp|tiff?)$/i.test(file.name));
  const zipFiles = files.filter((file) => /\.zip$/i.test(file.name));
  if (imageFiles.some((file) => file.size > 40 * 1024 * 1024)) throw new Error('حجم إحدى الصور يتجاوز 40 MB؛ استخدم صور JPEG مصغّرة أو أرشيف الإطارات من NASA PSI.');
  if (zipFiles.length) {
    if (!window.JSZip) throw new Error('مكتبة ZIP لم تُحمّل. تحقق من اتصال الإنترنت ثم أعد تحميل الصفحة.');
    for (const archive of zipFiles) {
      if (archive.size > 180 * 1024 * 1024) throw new Error(`الأرشيف ${archive.name} أكبر من 180 MB؛ ارفع عينة صور أصغر.`);
      const zip = await window.JSZip.loadAsync(archive);
      const entries = Object.values(zip.files).filter((entry) => !entry.dir && /\.(jpe?g|png|webp|bmp)$/i.test(entry.name)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      if (entries.length > 1200) throw new Error(`الأرشيف ${archive.name} يحتوي أكثر من 1200 صورة؛ اختر عينة أصغر.`);
      const expandedBytes = entries.reduce((sum, entry) => sum + (entry._data?.uncompressedSize || 0), 0);
      if (expandedBytes > 350 * 1024 * 1024) throw new Error(`حجم الصور بعد فك الضغط يتجاوز 350 MB في ${archive.name}.`);
      for (const entry of entries) {
        imageFiles.push(new File([await entry.async('blob')], entry.name.split('/').pop(), { type: `image/${entry.name.split('.').pop().toLowerCase().replace('jpg', 'jpeg')}` }));
      }
    }
  }
  imageFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  if (imageFiles.length) {
    const selected = imageFiles.length > 36 ? imageFiles.filter((_, index) => index % Math.ceil(imageFiles.length / 36) === 0).slice(0, 36) : imageFiles;
    const frames = [];
    for (let index = 0; index < selected.length; index += 1) {
      const image = await decodeImage(selected[index]);
      const { canvas, context } = createAnalysisCanvas(image.width, image.height, image);
      frames.push(measureFlameFrame(context.getImageData(0, 0, canvas.width, canvas.height), canvas.width, canvas.height, selected.length > 1 ? index / (selected.length - 1) * 100 : 0, selected[index].name));
      image.close?.();
      progressCallback(`تحليل الصور ${index + 1}/${selected.length}`);
    }
    return { frames, sourceName: zipFiles.length ? zipFiles.map((file) => file.name).join(', ') : `${imageFiles.length} صورة`, frameCount: frames.length, alignment: 'ترتيب الصور فقط؛ الزمن المطلق غير موجود في أسماء الإطارات.' };
  }

  const videos = files.filter((file) => file.type.startsWith('video/') || /\.(mp4|mov|webm|m4v)$/i.test(file.name));
  if (!videos.length) return null;
  const frames = [];
  for (const videoFile of videos) frames.push(...await analyzeVideo(videoFile, progressCallback));
  return { frames, sourceName: videos.map((file) => file.name).join(', '), frameCount: frames.length, alignment: 'زمن نسبي من الفيديو؛ يحتاج مزامنة ساعة الكاميرا مع telemetry.' };
}

async function analyzeVideo(file, progressCallback) {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = () => {
      const videoError = video.error?.message || `خطأ وسائط ${video.error?.code ?? 'غير معروف'}`;
      reject(new Error(`تعذر فك ترميز ${file.name} (${videoError}). استخدم MP4 H.264 أو WebM VP8.`));
    };
      video.src = url;
      video.load();
    });
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    if (!duration) throw new Error(`مدة الفيديو ${file.name} غير معروفة.`);
    const count = Math.min(32, Math.max(2, Math.ceil(duration / 1.5)));
    const frames = [];
    for (let index = 0; index < count; index += 1) {
        const targetTime = duration * index / (count - 1);
        if (Math.abs(video.currentTime - targetTime) >= 0.001) {
          await new Promise((resolve, reject) => {
            video.onseeked = resolve;
            video.onerror = () => reject(new Error(`فشل استخراج الإطار ${index + 1} من ${file.name}.`));
            video.currentTime = targetTime;
          });
        }
      const { canvas, context } = createAnalysisCanvas(video.videoWidth, video.videoHeight, video);
      frames.push(measureFlameFrame(context.getImageData(0, 0, canvas.width, canvas.height), canvas.width, canvas.height, video.currentTime / duration * 100, `${file.name} · ${video.currentTime.toFixed(1)} s`));
      progressCallback(`استخراج إطارات الفيديو ${index + 1}/${count}`);
    }
    video.removeAttribute('src');
    video.load();
    return frames;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function interpolateAt(samples, progress, channel) {
  if (!samples.length) return null;
  const usable = samples.map((sample) => ({ x: sample.progress, y: sample.values[channel] })).filter((point) => Number.isFinite(point.y));
  if (!usable.length) return null;
  if (progress <= usable[0].x) return usable[0].y;
  if (progress >= usable.at(-1).x) return usable.at(-1).y;
  for (let index = 1; index < usable.length; index += 1) {
    if (usable[index].x < progress) continue;
    const left = usable[index - 1];
    const right = usable[index];
    const portion = (progress - left.x) / Math.max(0.0001, right.x - left.x);
    return left.y + (right.y - left.y) * portion;
  }
  return usable.at(-1).y;
}

function fuseSignature(sensorData, imageData) {
  const progressPoints = Array.from({ length: 36 }, (_, index) => index / 35 * 100);
  const channels = {};
  for (const sensorKey of sensorData?.channels || []) {
    channels[sensorKey] = progressPoints.map((progress) => interpolateAt(sensorData.samples, progress, sensorKey));
  }
  if (imageData?.frames.length) {
    const frameChannels = [
      ['flameArea', 'warmPixelAreaPercent'], ['flameExtent', 'flameExtentPercent'], ['flameBrightness', 'flameBrightness']
    ];
    for (const [key, property] of frameChannels) {
      channels[key] = progressPoints.map((progress) => interpolateAt(imageData.frames.map((frame) => ({ progress: frame.progress, values: { [key]: frame[property] } })), progress, key));
    }
  }
  const finiteChannels = Object.keys(channels).filter((key) => channels[key].some(Number.isFinite));
  return { progressPoints, channels, channelKeys: finiteChannels };
}

function linearSlope(values) {
  const points = values.map((value, index) => ({ x: index, y: value })).filter((point) => Number.isFinite(point.y));
  if (points.length < 2) return 0;
  const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  const numerator = points.reduce((sum, point) => sum + (point.x - meanX) * (point.y - meanY), 0);
  const denominator = points.reduce((sum, point) => sum + (point.x - meanX) ** 2, 0);
  return denominator ? numerator / denominator : 0;
}

function updateMetric(id, value) {
  document.querySelector(`#${id}`).textContent = value;
}

function formatChannelValue(value) {
  if (!Number.isFinite(value)) return '—';
  const magnitude = Math.abs(value);
    return value.toFixed(magnitude >= 100 ? 1 : magnitude >= 10 ? 2 : 3).replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1');
}

function renderChannelTable(signature, sensorData) {
  const body = document.querySelector('#signatureChannelRows');
  body.replaceChildren();
  for (const key of signature.channelKeys) {
    const values = signature.channels[key].filter(Number.isFinite);
    if (!values.length) continue;
    const sourceLabel = sensorData?.channelHeaders?.[key] || ({
      flameArea: 'Flame pixel area (%)', flameExtent: 'Flame extent (% frame)', flameBrightness: 'Flame-region brightness (0–255)'
    }[key] || key);
    const row = document.createElement('tr');
    for (const value of [sourceLabel, formatChannelValue(values[0]), formatChannelValue(Math.min(...values)), formatChannelValue(Math.max(...values)), formatChannelValue(values.at(-1))]) {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.append(cell);
    }
    body.append(row);
  }
}

function drawSignatureChart(signature) {
  const canvas = signatureCanvas;
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(rect.width * ratio));
  canvas.height = Math.max(1, Math.round(230 * ratio));
  const context = canvas.getContext('2d');
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  const width = rect.width;
  const height = 230;
  const padding = { top: 18, right: 18, bottom: 29, left: 34 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  context.clearRect(0, 0, width, height);
  context.font = '10px IBM Plex Sans Arabic, sans-serif';
  context.textAlign = 'right';
  context.textBaseline = 'middle';
  for (let tick = 0; tick <= 4; tick += 1) {
    const y = padding.top + plotHeight * tick / 4;
    context.strokeStyle = '#e9eee9';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
    context.fillStyle = '#99a49d';
    context.fillText((100 - tick * 25).toString(), padding.left - 7, y);
  }
  context.textAlign = 'center';
  for (const tick of [0, 25, 50, 75, 100]) {
    const x = padding.left + plotWidth * tick / 100;
    context.fillStyle = '#99a49d';
    context.fillText(`${tick}%`, x, height - 11);
  }
  const legend = document.querySelector('#signatureLegend');
  legend.replaceChildren();
  const seriesToShow = signature.channelKeys.slice(0, 8);
  for (const key of seriesToShow) {
    const values = signature.channels[key];
    const finite = values.filter(Number.isFinite);
    if (finite.length < 2) continue;
    const minimum = Math.min(...finite);
    const maximum = finite.reduce((value, item) => Math.max(value, item), -Infinity);
    const range = maximum - minimum || 1;
    const span = document.createElement('span');
    span.innerHTML = `<i style="background:${seriesColors[key] || '#668276'}"></i>${channelDefinitions.find((channel) => channel.key === key)?.label || ({ flameArea: 'Flame area', flameExtent: 'Flame extent', flameBrightness: 'Brightness' }[key] || key)}`;
    legend.append(span);
    context.beginPath();
    values.forEach((value, index) => {
      if (!Number.isFinite(value)) return;
      const x = padding.left + plotWidth * index / Math.max(1, values.length - 1);
      const y = padding.top + plotHeight * (1 - (value - minimum) / range);
      if (index === 0 || !Number.isFinite(values[index - 1])) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.strokeStyle = seriesColors[key] || '#668276';
    context.lineWidth = 2;
    context.lineJoin = 'round';
    context.stroke();
  }
  document.querySelector('#signatureChartCaption').textContent = 'كل قناة مطبّعة على مداها (0–100) لتسهيل المقارنة؛ القيم الأصلية باقية في بصمة التحليل.';
}

function describeSignature(signature, sensorData, imageData, sourceNames) {
  const flameAreas = imageData?.frames.map((frame) => frame.warmPixelAreaPercent) || [];
  const extents = imageData?.frames.map((frame) => frame.flameExtentPercent) || [];
  const brightness = imageData?.frames.map((frame) => frame.flameBrightness).filter((value) => value > 0) || [];
  const areaSlope = linearSlope(flameAreas);
  updateMetric('flameAreaMetric', flameAreas.length ? `${flameAreas.at(-1).toFixed(2)}%` : 'لا صور');
  updateMetric('flameLengthMetric', extents.length ? `${Math.max(...extents).toFixed(1)}%` : 'لا صور');
  updateMetric('flameBrightnessMetric', brightness.length ? `${(brightness.reduce((sum, value) => sum + value, 0) / brightness.length).toFixed(0)} / 255` : 'لا صور');
  updateMetric('flameGrowthMetric', flameAreas.length > 1 ? `${areaSlope >= 0 ? '+' : ''}${(areaSlope * 3.5).toFixed(3)}` : 'لا سلسلة');
  const risingChannels = signature.channelKeys.filter((key) => linearSlope(signature.channels[key]) > 0).length;
  const summary = imageData?.frames.length
    ? areaSlope > 0.01 ? `المؤشرات البصرية المستخرجة تُظهر زيادة في مساحة اللون الدافئ عبر الإطارات (${imageData.frameCount} إطارًا).` : `المساحة البصرية شبه ثابتة أو تتناقص ضمن العينة (${imageData.frameCount} إطارًا).`
    : `اكتملت بصمة الحساسات من ${sensorData.rowCount} صفًا؛ أُظهر ${risingChannels} من ${signature.channelKeys.length} قنوات اتجاهًا صاعدًا.`;
  document.querySelector('#signatureSummary').textContent = summary;
  document.querySelector('#signatureProvenance').textContent = `${sourceNames.join(' + ')} · تحليل محلي · لا توقع مستقبلي.`;
  renderChannelTable(signature, sensorData);
  signatureOutput.hidden = false;
  signatureEmpty.hidden = true;
  drawSignatureChart(signature);
  if (imageData?.frames.length) {
    const lastArea = flameAreas.at(-1) || 0;
    window.spaceFireTwin3D?.setObservedFlame({ areaPercent: lastArea, extentPercent: extents.length ? Math.max(...extents) : 0, brightness: brightness.length ? brightness.at(-1) : 0 });
  }
}

async function buildSignature() {
  const telemetryFile = telemetryInput.files[0];
  const cameraFiles = [...cameraInput.files];
  if (!telemetryFile && !cameraFiles.length) {
    setSignatureStatus('ارفع ملف telemetry أو صور/فيديو أولًا');
    return;
  }
  buildSignatureButton.disabled = true;
  buildSignatureButton.querySelector('span:nth-child(2)').textContent = 'جارٍ استخراج السمات…';
  setSignatureStatus('قراءة ملفات التجربة…', 'working');
  try {
    let sensorData = null;
    if (telemetryFile) {
      setSignatureStatus('قراءة أعمدة الحرارة والغازات والضغط…', 'working');
      sensorData = await readTelemetryFile(telemetryFile);
    }
    const imageData = cameraFiles.length
      ? await analyzeImageFiles(cameraFiles, (message) => setSignatureStatus(message, 'working'))
      : null;
    if (!sensorData && !imageData?.frames.length) throw new Error('ما أمكن استخراج telemetry أو إطارات صور من الملفات المختارة.');
    const signature = fuseSignature(sensorData, imageData);
    const sourceNames = [sensorData?.sourceName, imageData?.sourceName].filter(Boolean);
    describeSignature(signature, sensorData, imageData, sourceNames);
    lastSignature = {
      source: 'user-uploaded SAFFIRE files',
      alignment: imageData?.alignment || 'telemetry relative progress',
      sensorSamples: sensorData?.rowCount || 0,
      imageFrames: imageData?.frameCount || 0,
      progress: signature.progressPoints,
      channels: signature.channels,
      channelKeys: signature.channelKeys,
      channelHeaders: sensorData?.channelHeaders || {}
    };
    window.spaceFireSignature = lastSignature;
    setSignatureStatus(`${sensorData?.rowCount || 0} صف حساس · ${imageData?.frameCount || 0} إطار`, 'ready');
    showToast('اكتمل استخراج بصمة الحريق الديناميكية');
  } catch (error) {
    setSignatureStatus(error.message || 'تعذر تحليل الملفات');
    showToast('تعذر بناء البصمة: راجع تنسيق الملف');
  } finally {
    buildSignatureButton.disabled = false;
    buildSignatureButton.querySelector('span:nth-child(2)').textContent = 'إعادة استخراج البصمة';
  }
}

telemetryInput.addEventListener('change', () => {
  document.querySelector('#telemetryFileName').textContent = telemetryInput.files[0]?.name || 'CSV أو Excel · الوقت، الحرارة، الضغط، O₂، CO₂، التدفق';
  if (telemetryInput.files[0]) setSignatureStatus('ملف الحساسات جاهز للتحليل');
});

cameraInput.addEventListener('change', () => {
  const files = [...cameraInput.files];
  document.querySelector('#cameraFileName').textContent = files.length ? files.map((file) => file.name).join(' · ') : 'ZIP لإطارات JPEG، صور مرتبة، أو فيديو MP4 / WebM';
  if (files.length) setSignatureStatus(`${files.length} ملف كاميرا جاهز للتحليل`);
});

buildSignatureButton.addEventListener('click', buildSignature);
window.addEventListener('resize', () => { if (lastSignature) drawSignatureChart(lastSignature); });
