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

/**
 * Call OpenAI to detect an expertise direction from the description.
 *
 * Callers are responsible for:
 *   - validating that apiKey, description and availableDirections are non-empty
 *   - handling HTTP responses and logging
 *
 * @param {string} description
 * @param {Array<{id: string, name: string}>} availableDirections
 * @param {string} apiKey
 * @returns {Promise<DetectResult>}
 * @throws {Error} on network-level failure
 */
export async function detectDirection(description, availableDirections, apiKey) {
  const directionList = availableDirections.map(d => `- ${d.name}`).join("\n");

  const systemPrompt = `Ты классификатор направления судебной экспертизы. Не веди диалог. Не задавай вопросов. Не объясняй пользователю. Верни только JSON.

Задача: по описанию ситуации определить направление экспертизы из списка допустимых направлений.
Используй базу знаний как источник маркеров и сценариев для распознавания.
Нельзя выбирать направление вне справочника. Нельзя придумывать направления.
Если confidence < ${CONFIDENCE_THRESHOLD} — верни detected=false.
Если описание неконкретно или нет достаточных признаков — верни detected=false.

База знаний:
${KNOWLEDGE_BASE}

Допустимые направления (выбирать СТРОГО из этого списка, значение поля direction_name должно совпадать с одним из пунктов):
${directionList}

Формат ответа — строго JSON без markdown:
{"detected": true, "direction_name": "...", "confidence": 0.87, "reason": "краткое основание", "matched_markers": ["маркер1", "маркер2"]}
или если не определено:
{"detected": false, "direction_name": null, "confidence": 0, "reason": "причина", "matched_markers": []}`;

  const openAiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Описание ситуации:\n${description}` },
      ],
    }),
  });

  const httpStatus = openAiResponse.status;

  if (!openAiResponse.ok) {
    const errText = await openAiResponse.text().catch(() => "");
    return {
      status: "openai_error",
      httpStatus,
      errText: errText.slice(0, 200),
    };
  }

  const openAiData = await openAiResponse.json();
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

  return {
    status: "detected",
    httpStatus,
    aiSelectedName,
    detected: true,
    direction_id: matched.id,
    direction_name: matched.name,
    confidence,
    reason: parsed.reason,
    matched_markers: parsed.matched_markers ?? [],
  };
}
