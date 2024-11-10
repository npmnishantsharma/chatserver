const router = require('express').Router();

router.post('/createSession', (req, res) => {
    const sessionId = uuidv4();
    res.send({ sessionId });
});

module.exports = router;