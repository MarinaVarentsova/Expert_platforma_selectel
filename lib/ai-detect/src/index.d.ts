export declare const KNOWLEDGE_BASE: string;
export declare const CONFIDENCE_THRESHOLD: number;
export declare const KNOWLEDGE_BASE_ENTRIES: number;

export interface Direction {
  id: string;
  name: string;
}

export type DetectResult =
  | {
      status: "openai_error";
      httpStatus: number;
      errText: string;
    }
  | {
      status: "parse_error";
      httpStatus: number;
      rawContent: string;
    }
  | {
      status: "not_detected";
      httpStatus: number;
      detected: false;
      direction_id: null;
      direction_name: null;
      aiSelectedName: string | null;
      confidence: number;
      reason: string;
      matched_markers: string[];
    }
  | {
      status: "no_match";
      httpStatus: number;
      aiSelectedName: string;
      detected: false;
      direction_id: null;
      direction_name: null;
      confidence: 0;
      reason: string;
      matched_markers: string[];
    }
  | {
      status: "detected";
      httpStatus: number;
      aiSelectedName: string;
      detected: true;
      direction_id: string;
      direction_name: string;
      confidence: number;
      reason: string;
      matched_markers: string[];
    };

export declare function detectDirection(
  description: string,
  availableDirections: Direction[],
  apiKey: string,
): Promise<DetectResult>;
