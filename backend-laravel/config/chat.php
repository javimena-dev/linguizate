<?php

return [
    'daily_limit' => (int) env('CHAT_DAILY_LIMIT', 10),
    'model' => env('GROQ_MODEL', 'openai/gpt-oss-20b'),
    'connect_timeout' => (int) env('GROQ_CONNECT_TIMEOUT', 5),
    'timeout' => (int) env('GROQ_TIMEOUT', 25),
];
