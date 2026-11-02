<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\ChatController;
use App\Http\Middleware\EnsureStudent;
use App\Http\Middleware\EnsureEmailVerified;
use Illuminate\Support\Facades\Route;

Route::middleware('web')->group(function () {
    Route::prefix('auth')->group(function () {
        Route::post('/register', [AuthController::class, 'register'])->middleware('throttle:6,1');
        Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:8,1');
        Route::post('/password/forgot', [AuthController::class, 'forgotPassword'])->middleware('throttle:5,1');
        Route::post('/password/reset', [AuthController::class, 'resetPassword'])->middleware('throttle:5,1');
        Route::middleware('auth')->group(function () {
            Route::get('/session', [AuthController::class, 'session']);
            Route::delete('/session', [AuthController::class, 'logout']);
            Route::post('/email/resend', [AuthController::class, 'resendVerification']);
        });
    });

    Route::middleware(['auth', EnsureEmailVerified::class, EnsureStudent::class])->prefix('chat')->group(function () {
        Route::get('/usage', [ChatController::class, 'usage']);
        Route::post('/', [ChatController::class, 'stream']);
    });
});
