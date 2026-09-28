window.spaceFireNASAmodel = {
  "name": "SpaceFire historical SAFFIRE comparator",
  "version": 1,
  "algorithm": "L2-regularized logistic regression",
  "target": "NASA table records a measurable burn duration rather than \"Insignificant\"",
  "featureNames": [
    "bias",
    "oxygenFraction",
    "airFlowFraction",
    "concurrentFlow",
    "material_silicone",
    "material_fibrous",
    "material_polymer",
    "material_mixed",
    "material_other"
  ],
  "weights": [
    0.9971638662557868,
    -0.0012240450806917133,
    2.586686369475143e-8,
    0.1914827296219655,
    -2.252273973093344,
    0.8406936562956726,
    0.38916615647499714,
    0.3891666539867765,
    0.6332475580696265
  ],
  "training": {
    "sampleCount": 11,
    "positiveCases": 7,
    "insignificantCases": 4,
    "sources": [
      "PSI-98",
      "PSI-99"
    ],
    "validation": {
      "method": "leave-one-out cross-validation",
      "accuracy": 1,
      "balancedAccuracy": 1,
      "correct": "11/11"
    }
  },
  "limitations": "Small historical case table. This estimates a recorded sustained-burn outcome for similar SAFFIRE tests; it is not a spacecraft fire-spread simulator or a certified safety prediction.",
  "cases": [
    {
      "investigationId": "PSI-98",
      "sampleId": "S1",
      "material": "SIBAL Fabric",
      "oxygenPercent": 21.6,
      "airFlowCmS": 20,
      "flowDirection": "Concurrent",
      "burnDurationSeconds": 420,
      "sustainedBurn": 1,
      "materialClass": "fibrous"
    },
    {
      "investigationId": "PSI-98",
      "sampleId": "S2",
      "material": "SIBAL Fabric",
      "oxygenPercent": 21.5,
      "airFlowCmS": 20,
      "flowDirection": "Opposed",
      "burnDurationSeconds": 70,
      "sustainedBurn": 1,
      "materialClass": "fibrous"
    },
    {
      "investigationId": "PSI-99",
      "sampleId": "2-1",
      "material": "Silicone",
      "oxygenPercent": 21.5,
      "airFlowCmS": 20,
      "flowDirection": "Concurrent",
      "burnDurationSeconds": null,
      "sustainedBurn": 0,
      "materialClass": "silicone"
    },
    {
      "investigationId": "PSI-99",
      "sampleId": "2-2",
      "material": "Silicone",
      "oxygenPercent": 22.1,
      "airFlowCmS": 20,
      "flowDirection": "Concurrent",
      "burnDurationSeconds": null,
      "sustainedBurn": 0,
      "materialClass": "silicone"
    },
    {
      "investigationId": "PSI-99",
      "sampleId": "2-3",
      "material": "Silicone",
      "oxygenPercent": 22.1,
      "airFlowCmS": 20,
      "flowDirection": "Concurrent",
      "burnDurationSeconds": null,
      "sustainedBurn": 0,
      "materialClass": "silicone"
    },
    {
      "investigationId": "PSI-99",
      "sampleId": "2-4",
      "material": "Silicone",
      "oxygenPercent": 22.1,
      "airFlowCmS": 20,
      "flowDirection": "Opposed",
      "burnDurationSeconds": null,
      "sustainedBurn": 0,
      "materialClass": "silicone"
    },
    {
      "investigationId": "PSI-99",
      "sampleId": "2-5",
      "material": "Cotton-Fiberglass (SIBAL)",
      "oxygenPercent": 22.1,
      "airFlowCmS": 20,
      "flowDirection": "Concurrent",
      "burnDurationSeconds": 145,
      "sustainedBurn": 1,
      "materialClass": "fibrous"
    },
    {
      "investigationId": "PSI-99",
      "sampleId": "2-6",
      "material": "Not reported",
      "oxygenPercent": 22.1,
      "airFlowCmS": 20,
      "flowDirection": "Concurrent",
      "burnDurationSeconds": 115,
      "sustainedBurn": 1,
      "materialClass": "other"
    },
    {
      "investigationId": "PSI-99",
      "sampleId": "2-7",
      "material": "PMMA & Nomex",
      "oxygenPercent": 22.1,
      "airFlowCmS": 20,
      "flowDirection": "Concurrent",
      "burnDurationSeconds": 140,
      "sustainedBurn": 1,
      "materialClass": "mixed"
    },
    {
      "investigationId": "PSI-99",
      "sampleId": "2-8",
      "material": "PMMA",
      "oxygenPercent": 22.05,
      "airFlowCmS": 20,
      "flowDirection": "Concurrent",
      "burnDurationSeconds": 600,
      "sustainedBurn": 1,
      "materialClass": "polymer"
    },
    {
      "investigationId": "PSI-99",
      "sampleId": "2-9",
      "material": "Not reported",
      "oxygenPercent": 21.95,
      "airFlowCmS": 20,
      "flowDirection": "Concurrent",
      "burnDurationSeconds": 900,
      "sustainedBurn": 1,
      "materialClass": "other"
    }
  ],
  "sources": [
    {
      "investigationId": "PSI-98",
      "title": "Spacecraft Fire Safety Experiment-I",
      "doi": "10.60555/0t15-1z43",
      "license": "CC0-1.0",
      "source": "https://psi.nasa.gov/physci/repo/data/investigations/PSI-98",
      "file": "PSI-98_Experimental table_SAFFIRE-1.csv",
      "bytes": 469,
      "rows": 4
    },
    {
      "investigationId": "PSI-99",
      "title": "Spacecraft Fire Experiment-II",
      "doi": "10.60555/2chp-m469",
      "license": "CC0-1.0",
      "source": "https://psi.nasa.gov/physci/repo/data/investigations/PSI-99",
      "file": "PSI-99_Experimental table_SAFFIRE-2.csv",
      "bytes": 1973,
      "rows": 15
    },
    {
      "investigationId": "PSI-100",
      "title": "Spacecraft Fire Experiment-III",
      "doi": "10.60555/040q-4h36",
      "license": "CC0-1.0",
      "source": "https://psi.nasa.gov/physci/repo/data/investigations/PSI-100",
      "file": "PSI-100_Experimental table_SAFFIRE-3.csv",
      "bytes": 239,
      "rows": 2
    }
  ]
};
