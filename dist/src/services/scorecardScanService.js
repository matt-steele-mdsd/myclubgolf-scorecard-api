"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scanScorecardImage = scanScorecardImage;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
// Constructed lazily (not at module load) so it always sees ANTHROPIC_API_KEY
// regardless of whether the env file was loaded before or after this module
// was imported.
let client = null;
function getClient() {
    if (!client)
        client = new sdk_1.default();
    return client;
}
const SCORECARD_SCHEMA = {
    type: 'object',
    properties: {
        courseName: {
            anyOf: [{ type: 'string' }, { type: 'null' }],
            description: 'The golf course name printed on the scorecard, or null if not legible.',
        },
        holes: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    holeNum: { type: 'integer', description: 'Hole number, 1-18' },
                    par: { type: 'integer' },
                    hdcp: { type: 'integer', description: 'Handicap / stroke index for the hole' },
                },
                required: ['holeNum', 'par', 'hdcp'],
                additionalProperties: false,
            },
        },
    },
    required: ['courseName', 'holes'],
    additionalProperties: false,
};
/**
 * Scan a photo of a golf scorecard and extract the course name plus each hole's
 * par and handicap (stroke index), using Claude's vision + structured outputs.
 */
async function scanScorecardImage(imageBase64, mediaType) {
    const message = await getClient().messages.create({
        model: 'claude-opus-4-8',
        max_tokens: 4096,
        thinking: { type: 'adaptive' },
        output_config: { format: { type: 'json_schema', schema: SCORECARD_SCHEMA } },
        messages: [
            {
                role: 'user',
                content: [
                    {
                        type: 'image',
                        source: { type: 'base64', media_type: mediaType, data: imageBase64 },
                    },
                    {
                        type: 'text',
                        text: 'This is a photo of a golf scorecard. Read the "Par" row and the "Handicap" (or "HCP" / "Hdcp" / stroke index) row for each hole, and the course name if printed on the card. ' +
                            'Return one entry per hole you can actually read — do not guess or invent values for holes you cannot read clearly. ' +
                            'If the card only shows 9 holes, return only those 9.',
                    },
                ],
            },
        ],
    });
    const textBlock = message.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
        throw new Error('No text response from scorecard scan');
    }
    return JSON.parse(textBlock.text);
}
