import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const CONFIDENCE_THRESHOLD = 0.7;

const KNOWLEDGE_BASE = `
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

const KNOWLEDGE_BASE_ENTRIES = (KNOWLEDGE_BASE.match(/^\d+\./gm) ?? []).length;

router.post("/ai-detect-direction", async (req, res) => {
  // 1. Получен запрос
  req.log.info("[AI] request received");

  // 2. URL запроса
  req.log.info(`[AI] url=${req.originalUrl}`);

  const apiKey = process.env["OPENAI_API_KEY"];

  // 7. Есть ли OPENAI_API_KEY (никогда не печатать сам ключ)
  req.log.info(`[AI] OPENAI_API_KEY present=${apiKey ? "true" : "false"}`);

  if (!apiKey) {
    req.log.error("[AI] returning error — OPENAI_API_KEY not configured");
    res.status(503).json({ error: "AI service not configured" });
    return;
  }

  // 8. Загружена ли база знаний
  req.log.info(`[AI] knowledge base loaded=true`);

  // 9. Количество сценариев в базе знаний
  req.log.info(`[AI] knowledge base entries=${KNOWLEDGE_BASE_ENTRIES}`);

  const body = req.body as {
    description?: string;
    availableDirections?: Array<{ id: string; name: string }>;
  };

  const description = (body.description ?? "").trim();
  const availableDirections = body.availableDirections;

  // 3. Размер описания
  req.log.info(`[AI] description length=${description.length}`);

  // 4. Первые 150 символов описания
  req.log.info(`[AI] description preview=${description.slice(0, 150)}`);

  // 5. Сколько направлений пришло
  req.log.info(`[AI] available directions count=${Array.isArray(availableDirections) ? availableDirections.length : 0}`);

  // 6. Названия всех направлений
  req.log.info(
    `[AI] available directions=[\n${
      Array.isArray(availableDirections)
        ? availableDirections.map(d => `  "${d.name}"`).join(",\n")
        : ""
    }\n]`
  );

  if (!description || !Array.isArray(availableDirections) || availableDirections.length === 0) {
    req.log.warn("[AI] returning error — invalid input: description or availableDirections missing/empty");
    res.status(400).json({ error: "Invalid input: description and availableDirections required" });
    return;
  }

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

  try {
    // 10. Перед обращением к OpenAI
    req.log.info("[AI] sending request to OpenAI");

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

    // 11. После получения ответа — HTTP статус
    req.log.info(`[AI] OpenAI HTTP status=${openAiResponse.status}`);

    if (!openAiResponse.ok) {
      const errText = await openAiResponse.text().catch(() => "");
      req.log.error(`[AI] OpenAI error body=${errText.slice(0, 200)}`);
      req.log.error("[AI] returning error — OpenAI returned non-2xx status");
      res.status(502).json({ error: "AI service error" });
      return;
    }

    const openAiData = await openAiResponse.json() as {
      choices: Array<{ message: { content: string } }>;
    };

    const rawContent = openAiData.choices?.[0]?.message?.content ?? "{}";

    // 12. Первые 1000 символов ответа OpenAI
    req.log.info(`[AI] OpenAI raw response=${rawContent.slice(0, 1000)}`);

    let parsed: {
      detected: boolean;
      direction_name: string | null;
      confidence: number;
      reason: string;
      matched_markers: string[];
    };

    try {
      parsed = JSON.parse(rawContent) as typeof parsed;
    } catch (parseErr: unknown) {
      req.log.error(`[AI] failed to parse OpenAI JSON response: rawContent=${rawContent}`);
      console.error(parseErr);
      console.error((parseErr as Error).stack);
      res.json({ detected: false, direction_id: null, direction_name: null, confidence: 0, reason: "Parse error", matched_markers: [] });
      return;
    }

    // 13. Что выбрал AI
    req.log.info(`[AI] AI selected direction="${parsed.direction_name ?? "null"}" confidence=${parsed.confidence} detected=${parsed.detected}`);

    if (!parsed.detected || (parsed.confidence ?? 0) < CONFIDENCE_THRESHOLD || !parsed.direction_name) {
      req.log.info(`[AI] below threshold or not detected — confidence=${parsed.confidence} reason="${parsed.reason}"`);
      req.log.info("[AI] returning success (detected=false, fallback to manual)");
      res.json({
        detected: false,
        direction_id: null,
        direction_name: null,
        confidence: parsed.confidence ?? 0,
        reason: parsed.reason ?? "Недостаточно признаков",
        matched_markers: parsed.matched_markers ?? [],
      });
      return;
    }

    const matched = availableDirections.find(
      d => d.name.trim().toLowerCase() === (parsed.direction_name ?? "").trim().toLowerCase()
    );

    // 14. Нашлось ли совпадение среди availableDirections
    req.log.info(`[AI] matched direction=${matched ? "true" : "false"}`);

    if (!matched) {
      // 15. Если совпадение не найдено — печатаем что ответил AI и что было доступно
      req.log.warn(
        `[AI] no match found\nAI ответил:\n  "${parsed.direction_name}"\nДоступные направления:\n${
          availableDirections.map(d => `  "${d.name}"`).join("\n")
        }`
      );
      req.log.info("[AI] returning success (detected=false, direction not in approved list)");
      res.json({
        detected: false,
        direction_id: null,
        direction_name: null,
        confidence: 0,
        reason: "Direction not in approved list",
        matched_markers: parsed.matched_markers ?? [],
      });
      return;
    }

    req.log.info(`[AI] direction matched — id=${matched.id} name="${matched.name}" confidence=${parsed.confidence}`);

    // 16. Финальный ответ — успех
    req.log.info("[AI] returning success (detected=true)");

    res.json({
      detected: true,
      direction_id: matched.id,
      direction_name: matched.name,
      confidence: parsed.confidence,
      reason: parsed.reason,
      matched_markers: parsed.matched_markers ?? [],
    });
  } catch (err: unknown) {
    // 17. Полный stack в catch
    console.error(err);
    console.error((err as Error).stack);
    logger.error({ err: (err as Error).message }, "[AI] returning error — unexpected exception");
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
