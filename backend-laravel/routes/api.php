<?php

use App\Http\Controllers\AdminController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\CatalogController;
use App\Http\Controllers\ChatController;
use App\Http\Controllers\GameController;
use App\Http\Controllers\InvitationController;
use App\Http\Controllers\ProfessorController;
use App\Http\Middleware\EnsureEmailVerified;
use App\Http\Middleware\EnsureStudent;
use Illuminate\Support\Facades\Route;

Route::prefix('auth')->group(function () {
    Route::post('/register', [AuthController::class, 'register'])->middleware('throttle:6,1');
    Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:8,1');
    Route::post('/password/forgot', [AuthController::class, 'forgotPassword'])->middleware('throttle:5,1');
    Route::post('/password/reset', [AuthController::class, 'resetPassword'])->middleware('throttle:5,1');
    Route::post('/invitations/accept', [InvitationController::class, 'accept'])->middleware('throttle:5,1');
    Route::middleware('auth:sanctum')->group(function () {
        Route::get('/session', [AuthController::class, 'session']);
        Route::delete('/session', [AuthController::class, 'logout']);
        Route::post('/email/resend', [AuthController::class, 'resendVerification']);
    });
});

Route::get('/health', fn () => ['ok' => true, 'message' => 'Lingüízate API']);
Route::get('/catalog', [CatalogController::class, 'catalog']);
Route::get('/subcategories/{id}/questions', [CatalogController::class, 'questions']);
Route::get('/ranking', [CatalogController::class, 'ranking']);

Route::middleware(['auth:sanctum', 'verified.api'])->group(function () {
    Route::post('/classes/join', [CatalogController::class, 'join'])->middleware('role:estudiante');
    Route::get('/users/me/games', [GameController::class, 'history']);
    Route::get('/users/me/progress', [GameController::class, 'progress']);
    Route::patch('/users/me', [GameController::class, 'updateProfile']);
    Route::post('/games', [GameController::class, 'store']);

    Route::prefix('professor')->middleware('role:profesor')->group(function () {
        Route::get('/categories', [ProfessorController::class, 'index']);
        Route::post('/categories', [ProfessorController::class, 'store']);
        Route::patch('/categories/{id}', [ProfessorController::class, 'update']);
        Route::delete('/categories/{id}', [ProfessorController::class, 'deletionDisabled']);
        Route::post('/categories/{id}/questions', [ProfessorController::class, 'storeQuestion']);
        Route::post('/categories/{id}/questions/import', [ProfessorController::class, 'import']);
        Route::patch('/questions/{id}', [ProfessorController::class, 'updateQuestion']);
        Route::delete('/questions/{id}', [ProfessorController::class, 'deletionDisabled']);
        Route::get('/statistics', [ProfessorController::class, 'statistics']);
    });

    Route::prefix('admin')->middleware('role:admin')->group(function () {
        Route::get('/users', [AdminController::class, 'users']);
        Route::post('/users', [InvitationController::class, 'createTeacher']);
        Route::post('/users/{user}/invitation', [InvitationController::class, 'resend']);
        Route::get('/dashboard', [AdminController::class, 'dashboard']);
        Route::get('/categories', [AdminController::class, 'categories']);
        Route::patch('/categories/{id}/approval', [AdminController::class, 'approval']);
        Route::delete('/professor-categories/{id}', [AdminController::class, 'deletionDisabled']);
        Route::get('/questions', [AdminController::class, 'questions']);
        Route::post('/questions', [AdminController::class, 'storeQuestion']);
        Route::patch('/questions/{id}', [AdminController::class, 'updateQuestion']);
        Route::delete('/questions/{id}', [AdminController::class, 'deletionDisabled']);
    });
});

Route::middleware(['auth:sanctum', EnsureEmailVerified::class, EnsureStudent::class])->prefix('chat')->group(function () {
    Route::get('/usage', [ChatController::class, 'usage']);
    Route::post('/', [ChatController::class, 'stream']);
});
