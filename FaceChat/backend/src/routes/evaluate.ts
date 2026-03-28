import { Router, Request, Response } from "express";
import multer from "multer";
import fs from "fs";
import { GoogleGenerativeAI } from "@google/generative-ai";

const router = Router();

// Multer saves the uploaded audio to a temp file on disk.
// The multipart form field must be named "audio".
const upload = multer({ dest: "uploads/" });

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Strict prompt that instructs Gemini to evaluate the spoken DSA answer
// and respond with a plain JSON object — no markdown, no extra commentary.
const EVALUATION_PROMPT = `You are a strict technical interviewer specialised in Data Structures and Algorithms (DSA).

The attached audio contains a candidate's spoken answer to a DSA interview question.

Listen carefully and evaluate the answer. Respond with ONLY a valid JSON object — no markdown code fences, no extra text — in exactly this shape:
{
  "technicalAccuracyScore": <integer between 0 and 100>,
  "timeComplexityAnalysis": "<string explaining the time complexity the candidate described>",
  "spaceComplexityAnalysis": "<string explaining the space complexity the candidate described>",
  "actionableFeedback": "<string with specific, constructive steps the candidate can take to improve>"
}`;

// POST /api/evaluate
// Accepts multipart/form-data with a single audio file field named "audio".
router.post("/", upload.single("audio"), async (req: Request, res: Response) => {
    const file = req.file;

    if (!file) {
        res.status(400).json({ error: "No audio file uploaded. Use the field name 'audio'." });
        return;
    }

    const filePath = file.path;

    try {
        // Step 1 – Read the audio file from disk and encode it as base64.
        // Gemini accepts audio as inline data, so we don't need a separate upload step.
        const audioBytes = fs.readFileSync(filePath);
        const audioBase64 = audioBytes.toString("base64");

        // Step 2 – Build the inline audio part for the Gemini request.
        // Use the MIME type that multer detected from the upload.
        const audioPart = {
            inlineData: {
                data: audioBase64,
                mimeType: file.mimetype,
            },
        };

        // Step 3 – Send both the audio and the evaluation prompt to Gemini.
        const result = await model.generateContent([EVALUATION_PROMPT, audioPart]);

        const rawText = result.response.text();

        if (!rawText) {
            res.status(500).json({ error: "Gemini returned an empty response." });
            return;
        }

        // Step 4 – Strip any accidental markdown fences before parsing.
        const cleanedText = rawText.replace(/```json|```/g, "").trim();

        let evaluation;

        try {
            evaluation = JSON.parse(cleanedText);
        } catch (parseErr) {
            console.error("Failed to parse Gemini response as JSON:", rawText);
            res.status(500).json({ error: "Gemini response was not valid JSON.", raw: rawText });
            return;
        }

        // Step 5 – Send the parsed evaluation back to the client.
        res.status(200).json(evaluation);

    } catch (err) {
        console.error("Error in /api/evaluate:", err);
        res.status(500).json({ error: "An error occurred while processing the audio." });

    } finally {
        // Step 6 – Always delete the temporary file, even when processing fails.
        fs.unlink(filePath, (unlinkErr) => {
            if (unlinkErr) {
                console.error("Failed to delete temp file:", filePath, unlinkErr);
            }
        });
    }
});

export default router;
