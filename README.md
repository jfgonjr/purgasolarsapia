# Proteção Solar Inteligente · Purga anti-congelamento de 10 mm

Site estático (HTML5 + Tailwind via CDN + JavaScript ES6 puro + Three.js r128).
Sem build. O modelo 3D carrega os 7 STL reais da pasta `stl/`.

```
index.html
js/main.js      simulador, calculadora de água, gráfico de densidade, mostrador do hero
js/viewer.js    visualizador 3D e vista explodida (lê os STL)
stl/            corpo, obturador, eixo, caixa_eletronica, placa_sensores, junta, tampa
vercel.json
```

## Publicar na Vercel

**Pelo GitHub (recomendado):** suba esta pasta num repositório, importe em vercel.com/new,
Framework Preset = *Other*, deixe Build Command e Output Directory vazios e clique em Deploy.

**Pela CLI:** `npm i -g vercel` e, dentro desta pasta, `vercel --prod`.

## Testar localmente

Os STL são carregados com `fetch`, então use um servidor (não abra com `file://`):

```
python3 -m http.server 8000   # depois acesse http://localhost:8000
```

## Trocar as peças do CAD

Substitua os arquivos em `stl/` mantendo os nomes (STL binário, coordenadas na posição de
montagem, Z para cima). Dimensões e deslocamentos da vista explodida ficam em `js/viewer.js`.
