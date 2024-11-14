const router = require('express').Router();
const {
    GoogleGenerativeAI,
    HarmCategory,
    HarmBlockThreshold,
  } = require("@google/generative-ai");

const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });

/**
 * Converts base64 image to Buffer
 */
function base64ToBuffer(base64String) {
  try {
    const base64Data = base64String.replace(/^data:image\/\w+;base64,/, '');
    return Buffer.from(base64Data, 'base64');
  } catch (error) {
    console.error('Error converting base64 to buffer:', error);
    return null;
  }
}

/**
 * Prepares image data for Gemini
 */
function prepareImagePart(imageBuffer) {
  try {
    return {
      inlineData: {
        data: imageBuffer.toString('base64'),
        mimeType: 'image/png'
      }
    };
  } catch (error) {
    console.error('Error preparing image part:', error);
    return null;
  }
}

const generationConfig = {
  temperature: 1,
  topP: 0.95,
  topK: 40,
  maxOutputTokens: 8192,
};

router.post('/chat/:sessionId', async (req, res) => {
  try {
    // Validate request body
    if (!req.body) {
      return res.status(400).json({
        status: 'error',
        message: 'Request body is missing'
      });
    }

    const { sessionId } = req.params;
    const { message, history = [], image } = req.body;

    // Log sanitized request data
    console.log('Session ID:', sessionId);
    console.log('Message:', message);
    console.log('Has Image:', !!image);
    console.log('History Length:', history.length);

    let result;
    if (image) {
      const imageBuffer = base64ToBuffer(image);
      if (!imageBuffer) {
        throw new Error('Failed to process image data');
      }

      const imagePart = prepareImagePart(imageBuffer);
      if (!imagePart) {
        throw new Error('Failed to prepare image for Gemini');
      }

      // Create chat with image
      const chat = model.startChat({
        history: Array.isArray(history) ? history : [],
        generationConfig,
      });

      // Send message with image
      result = await chat.sendMessage([
        imagePart,
        { text: message || "Please explain this mathematical expression." }
      ]);
    } else {
      // Text-only chat
      const chat = model.startChat({
        history: Array.isArray(history) ? history : [],
        generationConfig,
      });
      
      result = await chat.sendMessage(message);
    }

    const response = result.response.text();

    res.json({
      status: 'success',
      message: response,
      sessionId,
      history: Array.isArray(history) ? history : []
    });

  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to process chat request',
      error: error.message,
      history: Array.isArray(req.body?.history) ? req.body.history : []
    });
  }
});

// Add the quiz generation endpoint
router.post('/generate-quiz', async (req, res) => {
  try {
    const { topic, concepts, number_of_questions = 15 } = req.body;

    const prompt = `
    Generate ${number_of_questions} multiple-choice quiz questions about ${topic}. 
    Use these concepts as reference: ${concepts}
    
    Each question should:
    1. Be clear and concise
    2. Have 4 options (A, B, C, D)
    3. Include one correct answer
    4. Include a brief explanation of why the answer is correct
    
    Format each question as a JSON object with these fields:
    - question: The question text
    - options: Array of 4 possible answers
    - correctAnswer: The correct answer
    - explanation: Why this answer is correct
    
    Return an array of these question objects.
    `;

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();
    
    // Extract JSON from the response
    const jsonMatch = text.match(/```json\n?(.*?)\n?```/s) || text.match(/\[(.*)\]/s);
    const jsonStr = jsonMatch ? jsonMatch[1] : text;
    
    try {
      const questions = JSON.parse(jsonStr);
      res.json({
        status: 'success',
        questions: questions.slice(0, number_of_questions)
      });
    } catch (parseError) {
      console.error('Error parsing questions:', parseError);
      res.status(500).json({
        status: 'error',
        message: 'Failed to parse quiz questions',
        questions: []
      });
    }
  } catch (error) {
    console.error('Error generating quiz:', error);
    res.status(500).json({
      status: 'error',
      message: error.message,
      questions: []
    });
  }
});

module.exports = router;