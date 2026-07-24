import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";
import { detectDirection } from "@workspace/ai-detect";

const router: IRouter = Router();

router.post("/ai-detect-direction", async (req, res) => {
  const apiKey = process.env["OPENAI_API_KEY"];
  if (!apiKey) {
    req.log.error("OPENAI_API_KEY not configured");
    res.status(503).json({ error: "AI service not configured" });
    return;
  }

  const body = req.body as {
    description?: string;
    availableDirections?: Array<{ id: string; name: string }>;
  };

  const description = (body.description ?? "").trim();
  const availableDirections = body.availableDirections;

  if (!description || !Array.isArray(availableDirections) || availableDirections.length === 0) {
    res.status(400).json({ error: "Invalid input: description and availableDirections required" });
    return;
  }

  req.log.info({ descriptionLength: description.length }, "AI direction detection started");

  try {
    const result = await detectDirection(description, availableDirections, apiKey);

    if (result.status === "openai_error") {
      req.log.error({ status: result.httpStatus, errText: result.errText }, "OpenAI API error");
      res.status(502).json({ error: "AI service error" });
      return;
    }

    if (result.status === "parse_error") {
      req.log.error({ rawContent: result.rawContent }, "Failed to parse AI JSON response");
      res.json({ detected: false, direction_id: null, direction_name: null, confidence: 0, reason: "Parse error", matched_markers: [] });
      return;
    }

    req.log.info({
      detected: result.detected,
      direction_name: result.aiSelectedName,
      confidence: result.confidence,
    }, "AI parsed result");

    if (result.status === "not_detected") {
      req.log.info({ confidence: result.confidence, reason: result.reason }, `AI: below threshold or not detected — fallback to manual`);
      res.json({
        detected: false,
        direction_id: null,
        direction_name: null,
        confidence: result.confidence,
        reason: result.reason,
        matched_markers: result.matched_markers,
      });
      return;
    }

    if (result.status === "no_match") {
      req.log.warn({ direction_name: result.aiSelectedName }, "AI returned direction not in approved list — fallback to manual");
      res.json({
        detected: false,
        direction_id: null,
        direction_name: null,
        confidence: 0,
        reason: "Direction not in approved list",
        matched_markers: result.matched_markers,
      });
      return;
    }

    req.log.info({ direction_id: result.direction_id, direction_name: result.direction_name, confidence: result.confidence }, "AI: direction matched");

    res.json({
      detected: true,
      direction_id: result.direction_id,
      direction_name: result.direction_name,
      confidence: result.confidence,
      reason: result.reason,
      matched_markers: result.matched_markers,
    });
  } catch (err: unknown) {
    logger.error({ err: (err as Error).message }, "AI detect direction unexpected error");
    res.status(500).json({ error: "Internal error" });
  }
});

// suppress unused-import warning — CONFIDENCE_THRESHOLD is re-exported from the shared module
// and may be used by other consumers; imported here to keep the reference visible.
void CONFIDENCE_THRESHOLD;

export default router;
