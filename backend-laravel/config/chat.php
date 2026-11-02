<?php

return [
    'daily_limit' => (int) env('CHAT_DAILY_LIMIT', 10),
    'model' => env('GROQ_MODEL', 'llama-3.3-70b-versatile'),
    'connect_timeout' => (int) env('GROQ_CONNECT_TIMEOUT', 5),
    'timeout' => (int) env('GROQ_TIMEOUT', 25),
];
