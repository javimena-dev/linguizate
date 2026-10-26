# Cómo conectar la IA al chat de Lingüízate

La IA ya está integrada en el código. Solo tienes que **añadir una clave de API** en el servidor. Puedes usar **Groq** (gratis y rápido) o **OpenAI**.

---

## Opción A: Usar Groq (recomendado para empezar)

1. Crea una clave en **https://console.groq.com/keys** (cuenta gratuita).
2. En la carpeta **`backend`**, abre o crea el archivo **`.env`**.
3. Añade esta línea (sustituye por tu clave):

```env
GROQ_API_KEY=gsk_tu_clave_aqui
```

4. Reinicia el servidor (`npm start` en `backend`). El chat usará Groq (modelo `llama-3.1-8b-instant` por defecto).

Opcional: para otro modelo de Groq, añade `GROQ_MODEL=mixtral-8x7b-32768` (o el que prefieras).

---

## Opción B: Obtener una clave de API de OpenAI

1. Entra en **https://platform.openai.com** e inicia sesión (o crea una cuenta).
2. Ve a **API keys**: https://platform.openai.com/api-keys  
3. Pulsa **"Create new secret key"**, ponle un nombre (por ejemplo "Lingüízate") y copia la clave.  
   - Empieza por `sk-...`  
   - **Solo se muestra una vez**: si la pierdes, tendrás que crear otra.

---

## Paso 2: Crear el archivo `.env` en la carpeta `backend`

1. Abre la carpeta del proyecto y entra en **`backend`**.
2. Si no existe un archivo llamado **`.env`**:
   - Copia el archivo **`.env.example`** y renómbralo a **`.env`**,  
   - o crea un archivo nuevo llamado exactamente **`.env`** dentro de `backend`.
3. Abre **`.env`** con un editor de texto y deja algo así (sustituye la clave por la tuya):

```env
PORT=3000
JWT_SECRET=linguizate-secret-cambiar-en-produccion
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

- **OPENAI_API_KEY**: pega aquí la clave que copiaste en el Paso 1.  
- No pongas espacios ni comillas alrededor del valor.  
- No subas el archivo `.env` a internet (ya está en `.gitignore`).

---

## Paso 3: Reiniciar el servidor

1. Si el servidor está en marcha, deténlo (Ctrl+C en la terminal).
2. Vuelve a arrancarlo:

```bash
cd backend
npm start
```

3. Deberías ver en la consola algo como: **"Chat con IA activo (OPENAI_API_KEY configurada)."**

---

## Paso 4: Probar en la app

1. Abre **http://localhost:3000** en el navegador.
2. Juega una pregunta, mira la explicación y pulsa **"Chatear con la IA"**.
3. Escribe una pregunta (por ejemplo: "¿Puedes darme un ejemplo más?") y envía.  
   La IA debería responder en español usando el contexto de la pregunta y la explicación.

---

## Si algo falla

- **"Configura OPENAI_API_KEY..."**  
  El archivo `.env` no existe, está en otra carpeta o la variable se llama distinto. Debe ser exactamente `OPENAI_API_KEY` y el archivo `.env` dentro de `backend`.

- **"Error al conectar con la IA" / 401**  
  La clave es incorrecta o está mal pegada. Crea una nueva en OpenAI y actualiza `.env`.

- **429 (rate limit)**  
  Has superado el límite de uso de tu cuenta OpenAI. Espera un rato o revisa tu plan en platform.openai.com.

- **La IA no responde o tarda mucho**  
  Comprueba que el backend esté en marcha y que abras la app en **http://localhost:3000** (no en otro puerto como 8000).

---

## Modelo usado

Por defecto se usa **gpt-4o-mini** (rápido y económico). Para cambiar el modelo, añade en `.env`:

```env
OPENAI_MODEL=gpt-4o
```

y reinicia el servidor.
