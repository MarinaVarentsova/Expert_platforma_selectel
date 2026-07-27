export const CONSTRUCTION_DIRECTION_NAME = "Строительно-техническая экспертиза";

export const KNOWLEDGE_BASE = `
СУДЕБНО-СТРОИТЕЛЬНАЯ ЭКСПЕРТИЗА
Назначение: установить факт, объём и причины строительных повреждений; определить стоимость ремонта; проверить качество работ.

Сценарии и маркеры:

1. Залив (затопление) — залив, затопило, потоп, протечка, прорвало, стояк, батарея, крыша течёт, вода с потолка, пятна от воды, вздулся ламинат, отклеились обои, сырость, плесень после протечки, УК не признает, ТСЖ, соседи залили, страховая занизила ущерб, восстановительный ремонт.

2. Пожар — пожар, сгорело, обгорело, копоть, дым, после тушения залили, МЧС, страховая мало насчитала после пожара, ущерб от пожара, восстановление помещения после пожара.

3. Некачественный ремонт — плохо сделали ремонт, дефекты отделки, плитка отваливается, криво положили плитку, трещины по штукатурке, отклеиваются обои, неровные стены, неровная стяжка, подрядчик бросил объект, бригада сделала плохо, спор с исполнителем, стоимость переделки, устранение недостатков.

4. Строительство дома/объекта — строители плохо построили дом, фундамент треснул, фундамент просел, дом повело, крыша течёт, плохо сделали кровлю, стены треснули, кладка выполнена плохо, пристройка, баня, гараж, несоответствие проекту, смете, технологии строительства.

5. Дефекты от застройщика — застройщик сдал квартиру с дефектами, недостатки при приёмке, промерзают стены, дует из окон, плесень в новой квартире, трещины в стенах от застройщика, ДДУ, новостройка, акт приёма-передачи, компенсация застройщику.

6. Трещины и аварийность — трещины в стенах, просадка, деформация, аварийное состояние, техническое состояние здания, обследование конструкций, угроза обрушения.

7. Перепланировка и раздел — перепланировка, раздел имущества, определение долей, возможность раздела дома, коммуникации, перекрытия, несущие стены.

8. Оценка ущерба от ЧС — наводнение, оползень, ураган, ущерб от стихии, повреждение здания от природных явлений.

Стоп-факторы (НЕ строительная экспертиза): оценка мебели/техники/товаров (товароведческая); причина пожара/очаг возгорания (пожарно-техническая); юридический спор без технических вопросов; медицинские повреждения.
`;

export const CONFIDENCE_THRESHOLD = 0.7;

export const KNOWLEDGE_BASE_ENTRIES = (KNOWLEDGE_BASE.match(/^\d+\./gm) ?? []).length;

// ── Local deterministic checks ────────────────────────────────────────────────

/**
 * Stop-factor rules — any matching keyword/phrase → definitely NOT construction.
 * Checked before construction markers. Short-circuits immediately.
 */
const STOP_FACTOR_RULES = [
  { reason: "почерковедческая",    keywords: ["почерк", "почерковедческ", "почерковед"] },
  { reason: "почерковедческая",    keywords: ["подлинность"] },          // signature authenticity
  { reason: "товароведческая",     keywords: ["товароведческ"] },
  { reason: "медицинская",         keywords: ["медицинск", "судмед", "телесные повреждения", "вред здоровью", "медэкспертиз"] },
  { reason: "пожарно-техническая", keywords: ["очаг пожара", "очаг возгорания", "причина пожара", "причину пожара"] },
];

/**
 * Construction scenario markers — any single hit confirms the request is construction.
 */
const SCENARIO_MARKER_SETS = [
  // 1. Залив
  {
    scenario: "залив",
    markers: ["залив", "затопило", "потоп", "протечка", "прорвало", "стояк", "вода с потолка", "пятна от воды", "вздулся ламинат", "соседи залили", "страховая занизила", "восстановительный ремонт"],
  },
  // 2. Пожар (damage only, NOT cause/source — those are stop-factors)
  {
    scenario: "пожар_ущерб",
    markers: ["сгорело", "обгорело", "копоть", "после тушения", "ущерб от пожара", "восстановление помещения после пожара", "страховая мало насчитала после пожара"],
  },
  // 3. Некачественный ремонт
  {
    scenario: "ремонт_дефекты",
    markers: ["плохо сделали ремонт", "дефекты отделки", "плитка отваливается", "плитка отвал", "криво положили плитку", "трещины по штукатурке", "отклеиваются обои", "неровные стены", "неровная стяжка", "подрядчик бросил", "бригада сделала плохо", "устранение недостатков", "стоимость устранения", "дефект"],
  },
  // 4. Строительство дома/объекта
  {
    scenario: "строительство",
    markers: ["фундамент треснул", "фундамент просел", "дом повело", "плохо сделали кровлю", "стены треснули", "кладка выполнена плохо", "несоответствие проекту", "плохо построили", "строители плохо"],
  },
  // 5. Дефекты от застройщика
  {
    scenario: "застройщик",
    markers: ["застройщик сдал", "недостатки при приёмке", "промерзают стены", "дует из окон", "плесень в новой квартире", "трещины в стенах от застройщика", "новостройка", "акт приёма-передачи", "компенсация застройщику", "ддусу"],
  },
  // 6. Трещины и аварийность
  {
    scenario: "трещины",
    markers: ["трещины в стенах", "просадка", "деформация", "аварийное состояние", "техническое состояние здания", "обследование конструкций", "угроза обрушения"],
  },
  // 7. Перепланировка и раздел
  {
    scenario: "перепланировка",
    markers: ["перепланировка", "раздел имущества", "несущие стены", "определение долей"],
  },
  // 8. ЧС
  {
    scenario: "чс",
    markers: ["наводнение", "оползень", "ураган", "ущерб от стихии", "повреждение здания от природных явлений"],
  },
];

/**
 * Deterministic local check — no AI, no network.
 *
 * Returns:
 *   { matched: true,  scenario, isStopFactor: false, stopFactorReason: null, markers }
 *   { matched: false, scenario: null, isStopFactor: true,  stopFactorReason, markers }
 *   { matched: false, scenario: null, isStopFactor: false, stopFactorReason: null, markers: [] }  — ambiguous
 */
export function checkLocalMarkers(description) {
  const lower = description.toLowerCase();

  // 1. Stop-factors take priority
  for (const rule of STOP_FACTOR_RULES) {
    const hit = rule.keywords.find(kw => lower.includes(kw));
    if (hit) {
      return { matched: false, scenario: null, isStopFactor: true, stopFactorReason: rule.reason, markers: [hit] };
    }
  }

  // 2. Construction scenario markers
  for (const { scenario, markers } of SCENARIO_MARKER_SETS) {
    const hits = markers.filter(m => lower.includes(m));
    if (hits.length > 0) {
      return { matched: true, scenario, isStopFactor: false, stopFactorReason: null, markers: hits };
    }
  }

  // 3. Ambiguous — neither construction nor stop-factor
  return { matched: false, scenario: null, isStopFactor: false, stopFactorReason: null, markers: [] };
}

// ── AI-based detection ────────────────────────────────────────────────────────

/**
 * Call AI Gateway to classify whether the description matches construction expertise.
 *
 * availableDirections MUST contain exactly one entry:
 *   [{ id: "<uuid>", name: "Строительно-техническая экспертиза" }]
 *
 * @param {string} description
 * @param {Array<{id: string, name: string}>} availableDirections
 * @param {string} gatewayToken
 * @returns {Promise<DetectResult>}
 * @throws {Error} on network-level failure
 */
export async function detectDirection(description, availableDirections, gatewayToken) {
  const directionList = availableDirections.map(d => `- ${d.name}`).join("\n");

  const systemPrompt = `Ты классификатор для судебно-строительной экспертизы. Не веди диалог. Не задавай вопросов. Верни только JSON.

Задача: определить, соответствует ли описание ситуации одному из 8 строительных сценариев базы знаний.
Единственное допустимое направление: «${CONSTRUCTION_DIRECTION_NAME}».
ЗАПРЕЩЕНО: использовать собственные знания о других видах экспертиз.
ЗАПРЕЩЕНО: выбирать направление вне приведённого списка допустимых.
ЗАПРЕЩЕНО: распознавать почерковедческую, товароведческую, медицинскую, пожарно-техническую или любую другую экспертизу.

Стоп-факторы — немедленно верни detected=false без дальнейшего анализа:
- подлинность подписи, почерк, почерковедческая экспертиза
- оценка мебели / техники / товаров (товароведческая)
- причина пожара, очаг возгорания (пожарно-техническая)
- медицинские повреждения, вред здоровью
- юридический спор без строительных технических вопросов

Если confidence < ${CONFIDENCE_THRESHOLD} → верни detected=false.
Если описание не совпадает ни с одним из 8 сценариев базы знаний → верни detected=false.

База знаний (ТОЛЬКО строительные сценарии):
${KNOWLEDGE_BASE}

Допустимые направления (ровно один пункт — выбирать СТРОГО из него):
${directionList}

Формат ответа — строго JSON без markdown:
{"detected": true, "direction_name": "...", "confidence": 0.87, "reason": "краткое основание", "matched_markers": ["маркер1", "маркер2"]}
или если не определено:
{"detected": false, "direction_name": null, "confidence": 0, "reason": "причина", "matched_markers": []}`;

  const gatewayUrl = process.env.AI_GATEWAY_URL || "https://ai-gateway-core.vercel.app/api/chat";
  const model = "gpt-4o-mini";

  console.log("[AI-PROD] Gateway URL =", gatewayUrl);
  console.log("[AI-PROD] OpenAI model =", model);
  console.log("[AI-PROD] AI_GATEWAY_TOKEN присутствует =", gatewayToken ? "yes" : "missing");
  console.log("[AI-PROD] AI_GATEWAY_TOKEN length =", gatewayToken?.length ?? 0);
  console.log("[AI-PROD] AI_GATEWAY_TOKEN trimmed length =", gatewayToken?.trim().length ?? 0);
  console.log(
    "[AI-PROD] AI_GATEWAY_TOKEN has surrounding whitespace =",
    gatewayToken !== gatewayToken?.trim()
  );

  const openAiResponse = await fetch(gatewayUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": gatewayToken,
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Описание ситуации:\n${description}` },
      ],
    }),
  });

  const httpStatus = openAiResponse.status;
  const responseBody = await openAiResponse.text().catch(() => "");

  console.log("[AI-PROD] OpenAI response.status =", openAiResponse.status);
  console.log("[AI-PROD] OpenAI response.statusText =", openAiResponse.statusText);
  console.log(
    "[AI-PROD] OpenAI response.headers =",
    Object.fromEntries(openAiResponse.headers.entries())
  );

  if (!openAiResponse.ok) {
    console.log("[AI-PROD] OpenAI response.body =", responseBody);
    return {
      status: "openai_error",
      httpStatus,
      errText: responseBody.slice(0, 200),
    };
  }

  const openAiData = JSON.parse(responseBody);
  const rawContent = openAiData.choices?.[0]?.message?.content ?? "{}";

  let parsed;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    return {
      status: "parse_error",
      httpStatus,
      rawContent,
    };
  }

  const aiSelectedName = parsed.direction_name ?? null;
  const confidence = parsed.confidence ?? 0;
  const detected = parsed.detected ?? false;

  if (!detected || confidence < CONFIDENCE_THRESHOLD || !aiSelectedName) {
    return {
      status: "not_detected",
      httpStatus,
      detected: false,
      direction_id: null,
      direction_name: null,
      aiSelectedName,
      confidence,
      reason: parsed.reason ?? "Недостаточно признаков",
      matched_markers: parsed.matched_markers ?? [],
    };
  }

  // Deterministic gate: direction_name must exactly equal the allowed direction
  const matched = availableDirections.find(
    d => d.name.trim().toLowerCase() === aiSelectedName.trim().toLowerCase()
  );

  if (!matched) {
    return {
      status: "no_match",
      httpStatus,
      aiSelectedName,
      detected: false,
      direction_id: null,
      direction_name: null,
      confidence: 0,
      reason: "Direction not in approved list",
      matched_markers: parsed.matched_markers ?? [],
    };
  }

  // Final gate: matched_markers must be non-empty
  const matchedMarkers = parsed.matched_markers ?? [];
  if (matchedMarkers.length === 0) {
    return {
      status: "not_detected",
      httpStatus,
      detected: false,
      direction_id: null,
      direction_name: null,
      aiSelectedName,
      confidence,
      reason: "No matched markers returned by model",
      matched_markers: [],
    };
  }

  return {
    status: "detected",
    httpStatus,
    aiSelectedName,
    detected: true,
    direction_id: matched.id,
    direction_name: matched.name,
    confidence,
    reason: parsed.reason,
    matched_markers: matchedMarkers,
  };
}
