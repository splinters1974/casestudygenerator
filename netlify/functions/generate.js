exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    let body;
    try {
        body = JSON.parse(event.body);
    } catch {
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
    }

    const { prompt, model, maxTokens, apiKey } = body;

    if (!apiKey) {
        return { statusCode: 401, body: JSON.stringify({ error: 'API key required' }) };
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
            model: model || 'claude-sonnet-4-5',
            max_tokens: maxTokens || 3000,
            messages: [{ role: 'user', content: prompt }]
        })
    });

    const data = await response.json();
    return {
        statusCode: response.status,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    };
};
