# Efectos de sonido (SFX)

La función global `playSFX(type)` reproduce archivos desde la carpeta **`/sounds/`**.

Crea la carpeta `sounds` en la raíz del proyecto y añade los siguientes archivos en **MP3** (o ajusta la extensión en `script.js` si usas otro formato).

## Sonidos necesarios

| Tipo (`playSFX('tipo')`) | Uso en la app | Duración recomendada |
|--------------------------|----------------|----------------------|
| `correct` | Respuesta correcta | 0,3–0,5 s |
| `wrong` | Respuesta incorrecta | 0,3–0,5 s |
| `complete` | Pantalla de resultados (fin de partida) | 0,5–1 s |
| `record` | Nuevo récord personal (confetti) | 0,5–1 s |
| `timer_low` | Últimos segundos del cronómetro (modo clásico) | 0,2–0,4 s (puede repetirse) |
| `click` | Clic en botones / navegación | 0,1–0,2 s |
| `achievement` | Desbloqueo de logro | 0,5–0,8 s |

## Ejemplo de estructura

```
Linguizate/
  sounds/
    correct.mp3
    wrong.mp3
    complete.mp3
    record.mp3
    timer_low.mp3
    click.mp3
    achievement.mp3
```

Si falta un archivo, `playSFX` no hará nada (evita errores en consola). Puedes empezar con uno o dos sonidos e ir añadiendo el resto.
