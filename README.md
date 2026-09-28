# SpaceFire Twin

Arabic prototype for comparing selected experiment conditions with public NASA SAFFIRE results. The 3D cabin is illustrative; it is not a NASA station model.

## Run

From PowerShell in this folder:

```powershell
node scripts/serve.js
```

Open `http://127.0.0.1:4173`. Three.js is loaded from jsDelivr, so the 3D view needs an internet connection. The saved NASA tables and trained browser model work locally.

## Refresh NASA tables and train

```powershell
./scripts/download-nasa-data.ps1
node scripts/train-nasa-model.js
```

The downloader refreshes small experimental tables from NASA PSI and writes source IDs, DOIs, licenses, and row counts to `data/nasa/manifest.json`. The trainer reads SAFFIRE-I and SAFFIRE-II tables and writes `data/nasa/model.js`.

## Data and model scope

The current binary logistic-regression demonstrator uses 11 SAFFIRE-I/II records with a reported burn outcome: 7 sustained burns and 4 records marked insignificant. Inputs are oxygen fraction, airflow, flow direction, and material category. The UI only returns a score inside the oxygen/airflow ranges represented in training. Although SAFFIRE-III includes a 30 cm/s condition, its published experimental table does not include a burn outcome, so the UI intentionally shows no model score at that airflow.

The score is an uncalibrated model output for experiment-table outcomes, not a probability of a spacecraft fire. Leave-one-out validation on 11 highly related cases is exploratory and not evidence of general predictive accuracy. The current data do not support sensor time-series forecasting, heat/pressure/gas transport, battery failure prediction, station-specific fire trajectories, or safety recommendations. SAME/SAME-R tables are archived separately and are not part of this burn-outcome model.

NASA PSI records and DOI/license details are listed in `data/nasa/manifest.json` and linked in the app's source strip.

## Dynamic fire signature

The app also accepts a user-provided NASA telemetry CSV/XLS/XLSX and camera MP4/WebM, ordered JPEG/PNG files, or a ZIP of camera frames. It detects common time, thermocouple, pressure, O2, CO2 and anemometer headers; extracts warm-pixel area, frame extent, brightness and area change; then resamples channels to normalized experiment progress for a combined signature chart and original-value summary table. Inputs are processed in the browser and are not uploaded to a server.

The camera extraction is a warm-color pixel heuristic, not a validated flame-segmentation model. The ZIP/video timeline is only normalized progress; exact sensor-camera synchronization requires matching timestamps from the original experiment. The 3D flame preview scales from extracted metrics but does not reconstruct the flame's real location or physical spread. The existing 11-case logistic-regression model is not retrained by these uploaded files, because the current camera and sensor files are not labeled into synchronized training examples.

Feature extraction now reports the detected sensor column names and raw-unit start/minimum/maximum/end values alongside the normalized multi-channel chart. Supported camera inputs include JPEG/PNG/WebP frames, ZIP archives of frames, and browser-decodable MP4/WebM video; video samples are capped at 32 frames per file. Large archives and images are rejected with a size limit to avoid exhausting browser memory.

NASA PSI's SAFFIRE-I page lists the camera frame archives, telemetry workbooks, and image-nomenclature documentation under **Data files and documents → Raw Data / Science Documents**. The PSI download endpoint returned a missing-object response for the listed telemetry workbook in this environment, so obtain the file through the PSI page if needed, then select it in the app. Do not treat the published filenames alone as downloaded or analyzed measurements.
