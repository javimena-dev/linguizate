<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('categories', function (Blueprint $table) {
            $table->string('id', 191)->primary();
            $table->foreignId('owner_user_id')->nullable()->constrained('users')->cascadeOnDelete();
            $table->string('name');
            $table->text('description')->nullable();
            $table->string('icon')->default('fas fa-book');
            $table->string('kind')->default('system');
            $table->boolean('is_private')->default(false);
            $table->boolean('approved')->default(true);
            $table->string('access_code', 16)->nullable()->unique();
            $table->unsignedInteger('display_order')->default(0);
            $table->timestamps();
            $table->index(['kind', 'approved']);
        });

        Schema::create('subcategories', function (Blueprint $table) {
            $table->string('id', 191)->primary();
            $table->string('category_id', 191);
            $table->string('name');
            $table->text('description')->nullable();
            $table->string('icon')->default('fas fa-book-open');
            $table->unsignedInteger('display_order')->default(0);
            $table->timestamps();
            $table->foreign('category_id')->references('id')->on('categories')->cascadeOnDelete();
        });

        Schema::create('questions', function (Blueprint $table) {
            $table->string('id', 191)->primary();
            $table->string('subcategory_id', 191);
            $table->foreignId('owner_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->text('question');
            $table->json('options');
            $table->unsignedTinyInteger('correct_index');
            $table->string('difficulty', 16);
            $table->text('explanation')->nullable();
            $table->unsignedInteger('display_order')->default(0);
            $table->timestamps();
            $table->foreign('subcategory_id')->references('id')->on('subcategories')->cascadeOnDelete();
            $table->index(['subcategory_id', 'display_order']);
        });

        Schema::create('games', function (Blueprint $table) {
            $table->id();
            $table->string('client_game_id', 191);
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('category_id', 191)->nullable();
            $table->string('subcategory_id', 191)->nullable();
            $table->string('category_name');
            $table->string('subcategory_name');
            $table->string('mode', 16);
            $table->integer('score');
            $table->unsignedSmallInteger('correct_answers');
            $table->unsignedSmallInteger('incorrect_answers');
            $table->unsignedSmallInteger('best_streak')->default(0);
            $table->decimal('avg_response_seconds', 8, 3)->default(0);
            $table->timestamp('played_at');
            $table->timestamps();
            $table->unique(['user_id', 'client_game_id']);
            $table->foreign('category_id')->references('id')->on('categories')->nullOnDelete();
            $table->foreign('subcategory_id')->references('id')->on('subcategories')->nullOnDelete();
            $table->index(['user_id', 'played_at']);
        });

        Schema::create('question_attempts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('game_id')->constrained('games')->cascadeOnDelete();
            $table->string('question_id', 191)->nullable();
            $table->boolean('is_correct');
            $table->decimal('response_time_seconds', 8, 3)->default(0);
            $table->timestamps();
            $table->foreign('question_id')->references('id')->on('questions')->nullOnDelete();
        });

        Schema::create('user_achievements', function (Blueprint $table) {
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('achievement');
            $table->timestamp('unlocked_at')->useCurrent();
            $table->primary(['user_id', 'achievement']);
        });

        Schema::create('user_invitations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained('users')->cascadeOnDelete();
            $table->foreignId('created_by_user_id')->constrained('users')->cascadeOnDelete();
            $table->string('token', 64)->unique();
            $table->timestamp('expires_at');
            $table->timestamp('accepted_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_invitations');
        Schema::dropIfExists('user_achievements');
        Schema::dropIfExists('question_attempts');
        Schema::dropIfExists('games');
        Schema::dropIfExists('questions');
        Schema::dropIfExists('subcategories');
        Schema::dropIfExists('categories');
    }
};
