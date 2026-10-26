# Imágenes de fondo por categoría

Para usar imágenes de fondo en cada categoría (pantalla de selección o durante el juego), sigue estas recomendaciones.

## Tamaño máximo recomendado

| Concepto | Píxeles | Notas |
|----------|---------|--------|
| **Resolución** | **1920 × 1080** (Full HD) | Cubre la mayoría de pantallas sin pixelado. |
| **Alternativa más ligera** | **1200 × 800** | Buena relación calidad / peso. |
| **Peso por archivo** | **200–300 KB** máximo | Para que la app cargue rápido. |

## Formato

- **WebP**: mejor compresión y calidad (recomendado).
- **JPG**: compatible con todos los navegadores, compresión buena.
- **PNG**: solo si necesitas transparencia; suele pesar más.

## Nomenclatura sugerida

Si guardas una imagen por categoría, puedes nombrarlas por el `id` de la categoría, por ejemplo:

- `fondo-general.jpg`
- `fondo-descriptiva.jpg`
- `fondo-fonologia.jpg`

O en una carpeta `assets/fondos/`:

- `assets/fondos/categoria-general.webp`

La integración en el código consistirá en asignar `background-image` al contenedor de la categoría usando la URL de la imagen correspondiente.
