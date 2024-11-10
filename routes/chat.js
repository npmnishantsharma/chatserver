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

module.exports = router;