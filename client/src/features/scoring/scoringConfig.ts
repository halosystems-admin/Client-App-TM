import { ScoringConfig } from './scoringTypes';

export const scoringConfig: ScoringConfig = {
  systems: [
    {
      id: 'heart-score',
      title: 'HEART Score',
      category: 'Cardiology',
      description: 'Predicts 6-week risk of major adverse cardiac event (MACE).',
      criteria: [
        { id: 'history', type: 'multi', label: 'History', options: [ { id: 'h0', label: 'Slightly suspicious', points: 0 }, { id: 'h1', label: 'Moderately suspicious', points: 1 }, { id: 'h2', label: 'Highly suspicious', points: 2 } ] },
        { id: 'ecg', type: 'multi', label: 'ECG', options: [ { id: 'e0', label: 'Normal', points: 0 }, { id: 'e1', label: 'Non-specific repolarization', points: 1 }, { id: 'e2', label: 'Significant ST depression', points: 2 } ] },
        { id: 'age', type: 'multi', label: 'Age', options: [ { id: 'a0', label: '< 45 years', points: 0 }, { id: 'a1', label: '45-64 years', points: 1 }, { id: 'a2', label: '≥ 65 years', points: 2 } ] },
        { id: 'risk', type: 'multi', label: 'Risk Factors', options: [ { id: 'r0', label: 'No known risk factors', points: 0 }, { id: 'r1', label: '1-2 risk factors', points: 1 }, { id: 'r2', label: '≥ 3 risk factors or history of CAD', points: 2 } ] },
        { id: 'trop', type: 'multi', label: 'Initial Troponin', options: [ { id: 't0', label: '≤ Normal limit', points: 0 }, { id: 't1', label: '1-3x Normal limit', points: 1 }, { id: 't2', label: '> 3x Normal limit', points: 2 } ] }
      ],
      results: [
        { minScore: 0, maxScore: 3, riskLevel: 'Low', colorCode: 'emerald', clinicalRecommendation: '0.9-1.7% MACE. Consider discharge.' },
        { minScore: 4, maxScore: 6, riskLevel: 'Moderate', colorCode: 'amber', clinicalRecommendation: '12-16.6% MACE. Admit for clinical observation.' },
        { minScore: 7, maxScore: 10, riskLevel: 'High', colorCode: 'rose', clinicalRecommendation: '50-65% MACE. Early invasive strategies recommended.' }
      ]
    },
    {
      id: 'cha2ds2-vasc',
      title: 'CHA₂DS₂-VASc Score',
      category: 'Cardiology',
      description: 'Calculates stroke risk for patients with atrial fibrillation.',
      criteria: [
        { id: 'chf', type: 'binary', label: 'Congestive Heart Failure', points: 1 },
        { id: 'htn', type: 'binary', label: 'Hypertension', points: 1 },
        { id: 'age', type: 'multi', label: 'Age', options: [ { id: 'a0', label: '< 65', points: 0 }, { id: 'a1', label: '65-74', points: 1 }, { id: 'a2', label: '≥ 75', points: 2 } ] },
        { id: 'dm', type: 'binary', label: 'Diabetes Mellitus', points: 1 },
        { id: 'stroke', type: 'binary', label: 'Stroke/TIA/Thromboembolism history', points: 2 },
        { id: 'vasc', type: 'binary', label: 'Vascular disease (prior MI, PAD, aortic plaque)', points: 1 },
        { id: 'sex', type: 'multi', label: 'Sex', options: [ { id: 's0', label: 'Male', points: 0 }, { id: 's1', label: 'Female', points: 1 } ] }
      ],
      results: [
        { minScore: 0, maxScore: 0, riskLevel: 'Low', colorCode: 'emerald', clinicalRecommendation: '0% adjusted stroke risk. Omit antithrombotic therapy.' },
        { minScore: 1, maxScore: 1, riskLevel: 'Moderate', colorCode: 'amber', clinicalRecommendation: '1.3% adjusted stroke risk. Consider oral anticoagulation.' },
        { minScore: 2, maxScore: 9, riskLevel: 'High', colorCode: 'rose', clinicalRecommendation: '≥ 2.2% adjusted stroke risk. Oral anticoagulation recommended.' }
      ]
    },
    {
      id: 'wells-dvt',
      title: 'Wells Criteria (DVT)',
      category: 'Pulmonology',
      description: 'Calculates pre-test probability of Deep Vein Thrombosis.',
      criteria: [
        { id: 'cancer', type: 'binary', label: 'Active cancer (treatment ongoing, or within 6 mos)', points: 1 },
        { id: 'paralysis', type: 'binary', label: 'Paralysis, paresis, or recent plaster cast of lower extremities', points: 1 },
        { id: 'bedridden', type: 'binary', label: 'Recently bedridden > 3 days or major surgery within 12 weeks', points: 1 },
        { id: 'tenderness', type: 'binary', label: 'Localized tenderness along deep venous system', points: 1 },
        { id: 'swelling', type: 'binary', label: 'Entire leg swollen', points: 1 },
        { id: 'calf', type: 'binary', label: 'Calf swelling > 3 cm compared to asymptomatic leg', points: 1 },
        { id: 'edema', type: 'binary', label: 'Pitting edema (greater in symptomatic leg)', points: 1 },
        { id: 'veins', type: 'binary', label: 'Collateral superficial veins (non-varicose)', points: 1 },
        { id: 'alt', type: 'binary', label: 'Alternative diagnosis at least as likely as DVT', points: -2 }
      ],
      results: [
        { minScore: -2, maxScore: 0, riskLevel: 'Low', colorCode: 'emerald', clinicalRecommendation: 'Probability of DVT is 5%. Proceed with D-dimer testing.' },
        { minScore: 1, maxScore: 2, riskLevel: 'Moderate', colorCode: 'amber', clinicalRecommendation: 'Probability of DVT is 17%. Proceed with D-dimer or Ultrasound.' },
        { minScore: 3, maxScore: 9, riskLevel: 'High', colorCode: 'rose', clinicalRecommendation: 'Probability of DVT is 17-53%. Proceed directly to Ultrasound.' }
      ]
    },
    {
      id: 'curb-65',
      title: 'CURB-65 Score',
      category: 'Pulmonology',
      description: 'Estimates mortality in community-acquired pneumonia to help determine inpatient vs. outpatient treatment.',
      criteria: [
        { id: 'confusion', type: 'binary', label: 'Confusion (AMTS ≤ 8)', points: 1 },
        { id: 'urea', type: 'binary', label: 'BUN > 19 mg/dL (> 7 mmol/L)', points: 1 },
        { id: 'respiratory', type: 'binary', label: 'Respiratory Rate ≥ 30 breaths/min', points: 1 },
        { id: 'bp', type: 'binary', label: 'Systolic BP < 90 mmHg or Diastolic BP ≤ 60 mmHg', points: 1 },
        { id: 'age', type: 'binary', label: 'Age ≥ 65 years', points: 1 }
      ],
      results: [
        { minScore: 0, maxScore: 1, riskLevel: 'Low', colorCode: 'emerald', clinicalRecommendation: '0.7-2.1% 30-day mortality. Consider outpatient treatment.' },
        { minScore: 2, maxScore: 2, riskLevel: 'Moderate', colorCode: 'amber', clinicalRecommendation: '9.2% 30-day mortality. Consider hospital admission (short stay or ward).' },
        { minScore: 3, maxScore: 5, riskLevel: 'High', colorCode: 'rose', clinicalRecommendation: '14.5-57% 30-day mortality. Admit to hospital, consider ICU.' }
      ]
    },
    {
      id: 'gcs',
      title: 'Glasgow Coma Scale',
      category: 'Neurology',
      description: 'Standardized scale to assess the level of consciousness after brain injury.',
      criteria: [
        { id: 'eye', type: 'multi', label: 'Eye Opening', options: [ { id: 'e1', label: 'None (1)', points: 1 }, { id: 'e2', label: 'To pressure/pain (2)', points: 2 }, { id: 'e3', label: 'To sound/speech (3)', points: 3 }, { id: 'e4', label: 'Spontaneous (4)', points: 4 } ] },
        { id: 'verbal', type: 'multi', label: 'Verbal Response', options: [ { id: 'v1', label: 'None (1)', points: 1 }, { id: 'v2', label: 'Sounds/Incomprehensible (2)', points: 2 }, { id: 'v3', label: 'Words/Inappropriate (3)', points: 3 }, { id: 'v4', label: 'Confused (4)', points: 4 }, { id: 'v5', label: 'Oriented (5)', points: 5 } ] },
        { id: 'motor', type: 'multi', label: 'Motor Response', options: [ { id: 'm1', label: 'None (1)', points: 1 }, { id: 'm2', label: 'Extension to pain (2)', points: 2 }, { id: 'm3', label: 'Flexion to pain (3)', points: 3 }, { id: 'm4', label: 'Withdraws from pain (4)', points: 4 }, { id: 'm5', label: 'Localizes pain (5)', points: 5 }, { id: 'm6', label: 'Obeys commands (6)', points: 6 } ] }
      ],
      results: [
        { minScore: 3, maxScore: 8, riskLevel: 'High', colorCode: 'rose', clinicalRecommendation: 'Severe brain injury. Consider intubation (GCS < 8, intubate).' },
        { minScore: 9, maxScore: 12, riskLevel: 'Moderate', colorCode: 'amber', clinicalRecommendation: 'Moderate brain injury. Requires close monitoring.' },
        { minScore: 13, maxScore: 15, riskLevel: 'Low', colorCode: 'emerald', clinicalRecommendation: 'Minor brain injury. Routine observation.' }
      ]
    },
    {
      id: 'timi',
      title: 'TIMI Risk Score (UA/NSTEMI)',
      category: 'Cardiology',
      description: 'Estimates 14-day risk of death, new or recurrent MI, or urgent revascularization in unstable angina/NSTEMI.',
      criteria: [
        { id: 'age65', type: 'binary', label: 'Age ≥ 65 years', points: 1 },
        { id: 'riskfactors3', type: 'binary', label: '≥ 3 traditional CAD risk factors (e.g., HTN, DM, smoking, FHx, hyperlipidemia)', points: 1 },
        { id: 'knowncad', type: 'binary', label: 'Known coronary stenosis ≥ 50%', points: 1 },
        { id: 'asa7d', type: 'binary', label: 'Aspirin use in last 7 days', points: 1 },
        { id: 'recentangina', type: 'binary', label: '≥ 2 anginal episodes in last 24 hours', points: 1 },
        { id: 'stdeviation', type: 'binary', label: 'ST-segment deviation ≥ 0.5 mm', points: 1 },
        { id: 'elevatedmarkers', type: 'binary', label: 'Elevated cardiac biomarkers (e.g., troponin)', points: 1 }
      ],
      results: [
        { minScore: 0, maxScore: 2, riskLevel: 'Low', colorCode: 'emerald', clinicalRecommendation: '4.7–8.3% risk of composite endpoint. Consider conservative strategy with close observation.' },
        { minScore: 3, maxScore: 4, riskLevel: 'Moderate', colorCode: 'amber', clinicalRecommendation: '13.2–19.9% risk of composite endpoint. Consider early invasive strategy and guideline-directed therapy.' },
        { minScore: 5, maxScore: 7, riskLevel: 'High', colorCode: 'rose', clinicalRecommendation: '26.2–40.9% risk of composite endpoint. High-risk; recommend aggressive therapy and early invasive evaluation.' }
      ]
    },
    {
      id: 'wells-pe',
      title: 'Wells Criteria (PE)',
      category: 'Pulmonology',
      description: 'Estimates pre-test probability of pulmonary embolism.',
      criteria: [
        { id: 'dvtsigns', type: 'binary', label: 'Clinical signs and symptoms of DVT', points: 3 },
        { id: 'alternativeLessLikely', type: 'binary', label: 'PE more likely than alternative diagnosis', points: 3 },
        { id: 'hr100', type: 'binary', label: 'Heart rate > 100 beats/min', points: 1.5 },
        { id: 'immobSurgery', type: 'binary', label: 'Immobilization ≥ 3 days or surgery in previous 4 weeks', points: 1.5 },
        { id: 'priorDVTPe', type: 'binary', label: 'Previous DVT or PE', points: 1.5 },
        { id: 'hemoptysis', type: 'binary', label: 'Hemoptysis', points: 1 },
        { id: 'malignancy', type: 'binary', label: 'Malignancy (on treatment, treated in past 6 months, or palliative)', points: 1 }
      ],
      results: [
        { minScore: 0, maxScore: 1.5, riskLevel: 'Low', colorCode: 'emerald', clinicalRecommendation: '≈1.3–3.6% prevalence of PE (low probability). Consider PERC rule and D-dimer depending on clinical context.' },
        { minScore: 2, maxScore: 6, riskLevel: 'Moderate', colorCode: 'amber', clinicalRecommendation: '≈16.2% prevalence of PE (moderate probability). Obtain D-dimer and/or imaging per local protocol.' },
        { minScore: 6.5, maxScore: 12.5, riskLevel: 'High', colorCode: 'rose', clinicalRecommendation: '≈40.6–66.7% prevalence of PE (high probability). Consider immediate imaging and empiric anticoagulation if not contraindicated.' }
      ]
    },
    {
      id: 'perc',
      title: 'PERC Rule',
      category: 'Pulmonology',
      description: 'Pulmonary Embolism Rule-out Criteria: identifies very low-risk patients in whom no further PE testing is needed.',
      criteria: [
        { id: 'age50', type: 'binary', label: 'Age < 50 years', points: 0 },
        { id: 'hr100lt', type: 'binary', label: 'Heart rate < 100 beats/min', points: 0 },
        { id: 'sat95', type: 'binary', label: 'Oxygen saturation ≥ 95% on room air', points: 0 },
        { id: 'noHemoptysis', type: 'binary', label: 'No hemoptysis', points: 0 },
        { id: 'noEstrogen', type: 'binary', label: 'No exogenous estrogen use', points: 0 },
        { id: 'noSurgeryTrauma', type: 'binary', label: 'No recent surgery or trauma requiring hospitalization within 4 weeks', points: 0 },
        { id: 'noPriorDVTPe', type: 'binary', label: 'No prior DVT or PE', points: 0 },
        { id: 'noUnilateralSwelling', type: 'binary', label: 'No unilateral leg swelling', points: 0 }
      ],
      results: [
        { minScore: 0, maxScore: 0, riskLevel: 'Low', colorCode: 'emerald', clinicalRecommendation: 'If pre-test probability is low and all PERC criteria are negative, risk of PE is <2%; PE can usually be ruled out without further testing.' },
        { minScore: 1, maxScore: 8, riskLevel: 'Moderate', colorCode: 'amber', clinicalRecommendation: 'At least one criterion positive. PERC cannot be used to rule out PE; proceed with standard diagnostic workup (e.g., D-dimer, imaging).' }
      ]
    },
    {
      id: 'alvarado',
      title: 'Alvarado Score (MANTRELS)',
      category: 'General Surgery',
      description: 'Clinical prediction rule for likelihood of acute appendicitis.',
      criteria: [
        { id: 'migration', type: 'binary', label: 'Migration of pain to right lower quadrant', points: 1 },
        { id: 'anorexia', type: 'binary', label: 'Anorexia', points: 1 },
        { id: 'nauseaVomiting', type: 'binary', label: 'Nausea or vomiting', points: 1 },
        { id: 'tendernessRLQ', type: 'binary', label: 'Tenderness in right lower quadrant', points: 2 },
        { id: 'reboundPain', type: 'binary', label: 'Rebound pain in right lower quadrant', points: 1 },
        { id: 'elevatedTemp', type: 'binary', label: 'Elevated temperature ≥ 37.3°C (99.1°F)', points: 1 },
        { id: 'leukocytosis', type: 'binary', label: 'Leukocytosis (WBC > 10,000/mm³)', points: 2 },
        { id: 'shiftLeft', type: 'binary', label: 'Left shift (neutrophilia)', points: 1 }
      ],
      results: [
        { minScore: 0, maxScore: 4, riskLevel: 'Low', colorCode: 'emerald', clinicalRecommendation: '≈1–23% probability of appendicitis (low risk). Consider observation and alternative diagnoses.' },
        { minScore: 5, maxScore: 6, riskLevel: 'Moderate', colorCode: 'amber', clinicalRecommendation: '≈36–58% probability of appendicitis (intermediate risk). Consider imaging (e.g., ultrasound/CT) and surgical consultation.' },
        { minScore: 7, maxScore: 10, riskLevel: 'High', colorCode: 'rose', clinicalRecommendation: '≈78–90% probability of appendicitis (high risk). Urgent surgical evaluation recommended.' }
      ]
    },
    {
      id: 'child-pugh',
      title: 'Child–Pugh Score',
      category: 'Hepatology',
      description: 'Prognostic score for chronic liver disease and cirrhosis, stratifying severity and 1–2 year survival.',
      criteria: [
        { id: 'encephalopathy', type: 'multi', label: 'Hepatic encephalopathy', options: [ { id: 'ence0', label: 'None', points: 1 }, { id: 'ence12', label: 'Grade I–II (or controlled with medication)', points: 2 }, { id: 'ence34', label: 'Grade III–IV (or refractory)', points: 3 } ] },
        { id: 'ascites', type: 'multi', label: 'Ascites', options: [ { id: 'asc0', label: 'None', points: 1 }, { id: 'asc1', label: 'Mild/moderate (diuretic-responsive)', points: 2 }, { id: 'asc2', label: 'Severe/refractory', points: 3 } ] },
        { id: 'bilirubin', type: 'multi', label: 'Serum bilirubin (mg/dL)', options: [ { id: 'bili1', label: '< 2 mg/dL (34 μmol/L)', points: 1 }, { id: 'bili2', label: '2–3 mg/dL (34–50 μmol/L)', points: 2 }, { id: 'bili3', label: '> 3 mg/dL (> 50 μmol/L)', points: 3 } ] },
        { id: 'albumin', type: 'multi', label: 'Serum albumin (g/dL)', options: [ { id: 'alb1', label: '> 3.5 g/dL', points: 1 }, { id: 'alb2', label: '2.8–3.5 g/dL', points: 2 }, { id: 'alb3', label: '< 2.8 g/dL', points: 3 } ] },
        { id: 'inr', type: 'multi', label: 'INR or prothrombin time (sec over control)', options: [ { id: 'inr1', label: 'INR < 1.7 or PT < 4 sec over control', points: 1 }, { id: 'inr2', label: 'INR 1.7–2.3 or PT 4–6 sec over control', points: 2 }, { id: 'inr3', label: 'INR > 2.3 or PT > 6 sec over control', points: 3 } ] }
      ],
      results: [
        { minScore: 5, maxScore: 6, riskLevel: 'Low', colorCode: 'emerald', clinicalRecommendation: 'Child–Pugh class A (well-compensated). Approximate 1-year survival > 95%.' },
        { minScore: 7, maxScore: 9, riskLevel: 'Moderate', colorCode: 'amber', clinicalRecommendation: 'Child–Pugh class B (significant functional compromise). Approximate 1-year survival ~80–85%.' },
        { minScore: 10, maxScore: 15, riskLevel: 'High', colorCode: 'rose', clinicalRecommendation: 'Child–Pugh class C (decompensated). Approximate 1-year survival ~45–55%; consider transplant evaluation.' }
      ]
    },
    {
      id: 'meld',
      title: 'MELD Score (Categorical)',
      category: 'Hepatology',
      description: 'Model for End-Stage Liver Disease: categorical interpretation of numerically calculated MELD score.',
      criteria: [
        { id: 'meldBand', type: 'multi', label: 'Calculated MELD score', options: [ { id: 'meldlt10', label: '< 10', points: 1 }, { id: 'meld10to19', label: '10–19', points: 2 }, { id: 'meld20to29', label: '20–29', points: 3 }, { id: 'meld30to39', label: '30–39', points: 4 }, { id: 'meldge40', label: '≥ 40', points: 5 } ] }
      ],
      results: [
        { minScore: 1, maxScore: 2, riskLevel: 'Low', colorCode: 'emerald', clinicalRecommendation: 'MELD < 20. Estimated 3‑month mortality generally < 20%; continue medical management and surveillance.' },
        { minScore: 3, maxScore: 4, riskLevel: 'Moderate', colorCode: 'amber', clinicalRecommendation: 'MELD 20–39. Estimated 3‑month mortality ~20–70%; prioritize transplant evaluation and optimize complications.' },
        { minScore: 5, maxScore: 5, riskLevel: 'High', colorCode: 'rose', clinicalRecommendation: 'MELD ≥ 40. Estimated 3‑month mortality > 70%; urgent transplant consideration and intensive management.' }
      ]
    },
    {
      id: 'nihss',
      title: 'NIH Stroke Scale (NIHSS)',
      category: 'Neurology',
      description: 'Summarizes neurologic deficit severity in acute ischemic stroke based on total NIHSS score.',
      criteria: [
        { id: 'nihssBand', type: 'multi', label: 'Total NIHSS score', options: [ { id: 'nih0', label: '0', points: 0 }, { id: 'nih1to4', label: '1–4 (minor stroke)', points: 2 }, { id: 'nih5to15', label: '5–15 (moderate stroke)', points: 4 }, { id: 'nih16to20', label: '16–20 (moderately severe stroke)', points: 6 }, { id: 'nih21to42', label: '21–42 (severe stroke)', points: 8 } ] }
      ],
      results: [
        { minScore: 0, maxScore: 1, riskLevel: 'Low', colorCode: 'emerald', clinicalRecommendation: 'NIHSS 0–1: minor deficit; favorable prognosis, but still evaluate for secondary prevention.' },
        { minScore: 2, maxScore: 5, riskLevel: 'Moderate', colorCode: 'amber', clinicalRecommendation: 'NIHSS ~2–8 (mild–moderate): consider IV thrombolysis or thrombectomy eligibility within time windows.' },
        { minScore: 6, maxScore: 8, riskLevel: 'High', colorCode: 'rose', clinicalRecommendation: 'NIHSS ≥ 9: severe stroke with high risk of disability; requires intensive monitoring and advanced therapies when eligible.' }
      ]
    },
    {
      id: 'centor',
      title: 'Centor / McIsaac Criteria',
      category: 'Infectious Disease',
      description: 'Clinical prediction rule for group A streptococcal pharyngitis incorporating age adjustment (McIsaac).',
      criteria: [
        { id: 'tonsillarExudate', type: 'binary', label: 'Tonsillar exudates or swelling', points: 1 },
        { id: 'tenderAnteriorNodes', type: 'binary', label: 'Tender anterior cervical lymphadenopathy', points: 1 },
        { id: 'noCough', type: 'binary', label: 'Absence of cough', points: 1 },
        { id: 'feverHistory', type: 'binary', label: 'History of fever ≥ 38°C (100.4°F)', points: 1 },
        { id: 'ageBand', type: 'multi', label: 'Age adjustment', options: [ { id: 'age3to14', label: '3–14 years (+1)', points: 1 }, { id: 'age15to44', label: '15–44 years (0)', points: 0 }, { id: 'age45plus', label: '≥ 45 years (−1)', points: -1 } ] }
      ],
      results: [
        { minScore: -1, maxScore: 1, riskLevel: 'Low', colorCode: 'emerald', clinicalRecommendation: '≈1–10% probability of group A strep. Symptomatic care; routine antibiotics generally not indicated.' },
        { minScore: 2, maxScore: 3, riskLevel: 'Moderate', colorCode: 'amber', clinicalRecommendation: '≈11–35% probability of group A strep. Perform rapid antigen test and treat guided by results.' },
        { minScore: 4, maxScore: 5, riskLevel: 'High', colorCode: 'rose', clinicalRecommendation: '≈51–53% probability of group A strep. Consider empiric antibiotics or confirmatory testing per guidelines.' }
      ]
    },
    {
      id: 'qsofa',
      title: 'qSOFA',
      category: 'Critical Care',
      description: 'Quick Sequential Organ Failure Assessment: identifies patients with suspected infection at higher risk of poor outcome.',
      criteria: [
        { id: 'rr22', type: 'binary', label: 'Respiratory rate ≥ 22/min', points: 1 },
        { id: 'sbp100', type: 'binary', label: 'Systolic blood pressure ≤ 100 mmHg', points: 1 },
        { id: 'gcsAltered', type: 'binary', label: 'Altered mental status (GCS < 15)', points: 1 }
      ],
      results: [
        { minScore: 0, maxScore: 1, riskLevel: 'Low', colorCode: 'emerald', clinicalRecommendation: 'qSOFA 0–1: lower risk; continue close clinical observation and reassessment.' },
        { minScore: 2, maxScore: 3, riskLevel: 'High', colorCode: 'rose', clinicalRecommendation: 'qSOFA ≥ 2: significantly increased risk of in-hospital mortality; initiate sepsis bundle and consider ICU-level care.' }
      ]
    },
    {
      id: 'phq-9',
      title: 'PHQ-9 Depression Severity',
      category: 'Psychiatry',
      description: 'Patient Health Questionnaire-9: screening and severity measure for depressive symptoms over the past 2 weeks.',
      criteria: [
        { id: 'phqTotal', type: 'multi', label: 'Total PHQ-9 score', options: [ { id: 'phq0to4', label: '0–4 (minimal depression)', points: 1 }, { id: 'phq5to9', label: '5–9 (mild depression)', points: 2 }, { id: 'phq10to14', label: '10–14 (moderate depression)', points: 3 }, { id: 'phq15to19', label: '15–19 (moderately severe depression)', points: 4 }, { id: 'phq20to27', label: '20–27 (severe depression)', points: 5 } ] }
      ],
      results: [
        { minScore: 1, maxScore: 2, riskLevel: 'Low', colorCode: 'emerald', clinicalRecommendation: 'Minimal to mild symptoms. Provide education, watchful waiting, and consider brief interventions if needed.' },
        { minScore: 3, maxScore: 4, riskLevel: 'Moderate', colorCode: 'amber', clinicalRecommendation: 'Moderate to moderately severe depression. Recommend psychotherapy and/or antidepressant medication with regular follow-up.' },
        { minScore: 5, maxScore: 5, riskLevel: 'High', colorCode: 'rose', clinicalRecommendation: 'Severe depression. Consider combination therapy, safety planning, and urgent psychiatric evaluation if suicidality is present.' }
      ]
    },
    {
      id: 'gad-7',
      title: 'GAD-7 Anxiety Severity',
      category: 'Psychiatry',
      description: 'Generalized Anxiety Disorder 7-item scale: screening and severity measure for anxiety over the past 2 weeks.',
      criteria: [
        { id: 'gadTotal', type: 'multi', label: 'Total GAD-7 score', options: [ { id: 'gad0to4', label: '0–4 (minimal anxiety)', points: 1 }, { id: 'gad5to9', label: '5–9 (mild anxiety)', points: 2 }, { id: 'gad10to14', label: '10–14 (moderate anxiety)', points: 3 }, { id: 'gad15to21', label: '15–21 (severe anxiety)', points: 4 } ] }
      ],
      results: [
        { minScore: 1, maxScore: 2, riskLevel: 'Low', colorCode: 'emerald', clinicalRecommendation: 'Minimal to mild anxiety. Reassurance, psychoeducation, and self-management strategies may suffice.' },
        { minScore: 3, maxScore: 3, riskLevel: 'Moderate', colorCode: 'amber', clinicalRecommendation: 'Moderate anxiety. Recommend psychotherapy (e.g., CBT) and consider pharmacologic treatment.' },
        { minScore: 4, maxScore: 4, riskLevel: 'High', colorCode: 'rose', clinicalRecommendation: 'Severe anxiety. Consider combination of psychotherapy, pharmacotherapy, and closer follow-up.' }
      ]
    }
  ]
};

