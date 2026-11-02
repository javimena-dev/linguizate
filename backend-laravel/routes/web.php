<?php

use App\Http\Controllers\GoogleAuthController;
use App\Models\User;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

Route::prefix('api/auth/google')->group(function () {
    Route::get('/redirect', [GoogleAuthController::class, 'redirect'])->name('google.redirect');
    Route::get('/callback', [GoogleAuthController::class, 'callback'])->name('google.callback');
});

Route::get('/api/auth/email/verify/{id}/{hash}', function (int $id, string $hash) {
    $user = User::findOrFail($id);
    abort_unless(hash_equals(sha1($user->getEmailForVerification()), $hash), 403);
    if (! $user->hasVerifiedEmail()) {
        $user->markEmailAsVerified();
    }
    return redirect()->away(rtrim(config('app.frontend_url'), '/').'/chat?verified=1');
})->middleware('signed')->name('verification.verify');
