// -----------------------------------------------------------------------------
// CONFIGURAÇÃO: Lista padrão (caso não passe o parâmetro ?lista= na URL)
// -----------------------------------------------------------------------------
const M3U_PADRAO = "http://minhatv.sbs/get.php?username=gratis158853709&password=teste158853709&type=m3u_plus";

// CACHE EM MEMÓRIA DO WORKER (Chaveia por URL de lista)
let CACHE_DADOS = {};
let CACHE_TEMPO = {};
const CACHE_TTL = 10 * 60 * 1000; // 10 minutos

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    // 1. Pega a lista M3U informada na URL (?lista=http://...) ou usa a padrão
    const m3uUrl = url.searchParams.get("lista") || M3U_PADRAO;

    // 2. Rota Principal: Interface HTML para o iPad
    if (path === "/" || path === "/index.html") {
      return new Response(HTML_TEMPLATE, {
        headers: { "content-type": "text/html;charset=UTF-8" },
      });
    }

    // 3. Rota de Proxy para Vídeos (Evita erro de Mixed Content HTTP/HTTPS no iOS)
    if (path.startsWith("/proxy/")) {
      const streamUrl = decodeURIComponent(path.replace("/proxy/", ""));
      try {
        const response = await fetch(streamUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
          }
        });
        const newHeaders = new Headers(response.headers);
        newHeaders.set("Access-Control-Allow-Origin", "*");
        return new Response(response.body, {
          status: response.status,
          headers: newHeaders
        });
      } catch (e) {
        return new Response("Erro no proxy de vídeo", { status: 500 });
      }
    }

    // 4. Rota da API: Categorias
    if (path.startsWith("/api/categorias/")) {
      const secao = path.split("/")[3];
      const dados = await obterDadosM3U(m3uUrl);
      
      if (!dados[secao]) return Response.json([]);

      const categorias = Object.keys(dados[secao]).map(cat => ({
        nome: cat,
        qtd: dados[secao][cat].length
      }));

      return Response.json(categorias);
    }

    // 5. Rota da API: Itens de uma categoria
    if (path.startsWith("/api/itens/")) {
      const secao = path.split("/")[3];
      const categoria = url.searchParams.get("categoria");
      const dados = await obterDadosM3U(m3uUrl);

      if (dados[secao] && dados[secao][categoria]) {
        return Response.json(dados[secao][categoria]);
      }
      return Response.json([]);
    }

    return new Response("Não encontrado", { status: 404 });
  }
};

// --- GERENCIADOR DE CACHE DO PROCESSAMENTO ---
async function obterDadosM3U(m3uUrl) {
  const agora = Date.now();
  
  if (CACHE_DADOS[m3uUrl] && (agora - (CACHE_TEMPO[m3uUrl] || 0) < CACHE_TTL)) {
    return CACHE_DADOS[m3uUrl];
  }
  
  const dados = await processarM3U(m3uUrl);
  CACHE_DADOS[m3uUrl] = dados;
  CACHE_TEMPO[m3uUrl] = agora;
  return dados;
}

// --- PROCESSADOR DA LISTA M3U ---
async function processarM3U(m3uUrl) {
  const DADOS = { canais: {}, filmes: {}, series: {} };

  try {
    const res = await fetch(m3uUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!res.ok) return DADOS;

    const texto = await res.text();
    const linhas = texto.split("\n");

    let nomeAtual = null;
    let grupoAtual = "GERAL";

    for (let i = 0; i < linhas.length; i++) {
      let linha = linhas[i].trim();

      if (linha.startsWith("#EXTINF:")) {
        const idxGrupo = linha.indexOf('group-title="');
        if (idxGrupo !== -1) {
          const inicio = idxGrupo + 13;
          const fim = linha.indexOf('"', inicio);
          if (fim !== -1) {
            grupoAtual = linha.substring(inicio, fim).trim() || "GERAL";
          }
        } else {
          grupoAtual = "GERAL";
        }

        const idxVirgula = linha.lastIndexOf(",");
        if (idxVirgula !== -1) {
          nomeAtual = linha.substring(idxVirgula + 1).trim();
        }
      } else if (linha.startsWith("http") && nomeAtual) {
        const grupoUpper = grupoAtual.toUpperCase();
        const urlLower = linha.toLowerCase();

        let secao = "canais";
        if (grupoUpper.includes("SERIE") || grupoUpper.includes("SÉRIE") || grupoUpper.includes("SERIES")) {
          secao = "series";
        } else if (grupoUpper.includes("FILME") || grupoUpper.includes("VOD") || grupoUpper.includes("CINE") || 
                   urlLower.endsWith(".mp4") || urlLower.endsWith(".mkv") || urlLower.endsWith(".avi")) {
          secao = "filmes";
        }

        if (!DADOS[secao][grupoAtual]) {
          DADOS[secao][grupoAtual] = [];
        }

        DADOS[secao][grupoAtual].push({
          nome: nomeAtual,
          url: linha
        });

        nomeAtual = null;
        grupoAtual = "GERAL";
      }
    }
  } catch (e) {
    console.error("Erro na leitura da lista M3U:", e);
  }

  return DADOS;
}

// --- SUAS DIVS VISÍVEIS COMPATÍVEIS COM SAFARI ANTIGO (iOS 9) ---
const HTML_TEMPLATE = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>IPTV Super Leve</title>
    <style>
        body { font-family: -apple-system, sans-serif; background-color: #121212; color: #fff; margin: 0; padding: 15px; text-align: center; }
        .container { max-width: 800px; margin: 0 auto; }
        .tabs { display: flex; margin-bottom: 12px; }
        .tab-btn { flex: 1; padding: 12px 5px; font-size: 14px; font-weight: bold; background: #222; color: #888; border: 1px solid #333; cursor: pointer; margin: 0 2px; border-radius: 6px; }
        .tab-btn.active { background: #007aff; color: #fff; border-color: #007aff; }
        input { width: 100%; padding: 12px; font-size: 16px; margin-bottom: 10px; border-radius: 6px; border: 1px solid #333; background: #222; color: #fff; box-sizing: border-box; }
        .bread-btn { background: #333; color: #fff; border: none; padding: 12px; border-radius: 6px; font-size: 15px; width: 100%; margin-bottom: 10px; text-align: left; display: none; cursor: pointer; font-weight: bold; }
        video { width: 100%; height: auto; background: #000; border-radius: 8px; margin-top: 15px; }
        .status-loading { color: #007aff; font-size: 14px; margin-bottom: 5px; display: none; }
        
        .lista-box {
            background: #1a1a1a;
            border: 1px solid #333;
            border-radius: 8px;
            max-height: 280px;
            overflow-y: auto;
            -webkit-overflow-scrolling: touch;
            text-align: left;
        }
        .item-lista {
            padding: 12px 15px;
            border-bottom: 1px solid #282828;
            font-size: 15px;
            cursor: pointer;
            word-break: break-word;
        }
        .item-lista:active {
            background-color: #007aff;
        }
    </style>
</head>
<body>
<div class="container">
    <h2>IPTV Otimizado</h2>
    <div class="tabs">
        <button class="tab-btn active" id="btn-canais" onclick="selecionarTipo('canais')">Canais</button>
        <button class="tab-btn" id="btn-filmes" onclick="selecionarTipo('filmes')">Filmes</button>
        <button class="tab-btn" id="btn-series" onclick="selecionarTipo('series')">Séries</button>
    </div>
    
    <button id="btnVoltar" class="bread-btn" onclick="voltarParaPastas()">⬅️ Voltar para Pastas</button>
    <div id="statusLoading" class="status-loading">Carregando dados...</div>
    
    <input type="text" id="busca" placeholder="Filtrar nesta lista..." onkeyup="filtrarLista()">
    
    <div id="listaPrincipal" class="lista-box"></div>

    <div class="player-container">
        <h3 id="itemAtual">Selecione uma pasta acima</h3>
        <video id="player" controls autoplay playsinline></video>
    </div>
</div>

<script>
    var tipoAtivo = 'canais';
    var pastaAtiva = null;

    // Repassa os parâmetros da URL atual (como ?lista=...) para as chamadas da API
    function obterQueryString() {
        return window.location.search ? window.location.search : '';
    }

    function mostrarCarregando(show) { 
        document.getElementById('statusLoading').style.display = show ? 'block' : 'none'; 
    }

    function carregarPastas() {
        pastaAtiva = null;
        document.getElementById('btnVoltar').style.display = 'none';
        document.getElementById('busca').value = '';
        var lista = document.getElementById('listaPrincipal');
        lista.innerHTML = '';
        mostrarCarregando(true);

        var query = obterQueryString();
        var xhr = new XMLHttpRequest();
        xhr.open('GET', '/api/categorias/' + tipoAtivo + query, true);
        xhr.onload = function() {
            mostrarCarregando(false);
            if (xhr.status === 200) {
                var categorias = JSON.parse(xhr.responseText);
                if (categorias.length === 0) {
                    lista.innerHTML = '<div class="item-lista">Nenhum item nesta seção</div>';
                    return;
                }
                for (var i = 0; i < categorias.length; i++) {
                    var div = document.createElement('div');
                    div.className = 'item-lista';
                    div.innerText = "📁 " + categorias[i].nome + " (" + categorias[i].qtd + ")";
                    div.setAttribute('onclick', 'abrirPasta("' + encodeURIComponent(categorias[i].nome) + '")');
                    lista.appendChild(div);
                }
            }
        };
        xhr.send();
    }

    function abrirPasta(nomePastaEncoded) {
        var nomePasta = decodeURIComponent(nomePastaEncoded);
        pastaAtiva = nomePasta;
        document.getElementById('btnVoltar').style.display = 'block';
        document.getElementById('btnVoltar').innerText = "⬅️ Voltar (Pasta: " + nomePasta + ")";
        document.getElementById('busca').value = '';
        var lista = document.getElementById('listaPrincipal');
        lista.innerHTML = '';
        mostrarCarregando(true);

        var query = obterQueryString();
        var separador = query ? '&' : '?';
        var urlApi = '/api/itens/' + tipoAtivo + query + separador + 'categoria=' + encodeURIComponent(nomePasta);

        var xhr = new XMLHttpRequest();
        xhr.open('GET', urlApi, true);
        xhr.onload = function() {
            mostrarCarregando(false);
            if (xhr.status === 200) {
                var itens = JSON.parse(xhr.responseText);
                for (var i = 0; i < itens.length; i++) {
                    var div = document.createElement('div');
                    div.className = 'item-lista';
                    div.innerText = "▶ " + itens[i].nome;
                    div.setAttribute('onclick', 'tocarVideo("' + encodeURIComponent(itens[i].url) + '", "' + encodeURIComponent(itens[i].nome) + '")');
                    lista.appendChild(div);
                }
            }
        };
        xhr.send();
    }

    function tocarVideo(urlEncoded, nomeEncoded) {
        var url = decodeURIComponent(urlEncoded);
        var nome = decodeURIComponent(nomeEncoded);
        document.getElementById('itemAtual').innerText = "Reproduzindo: " + nome;
        var player = document.getElementById('player');
        
        if (url.indexOf("http://") === 0 && location.protocol === "https:") {
            player.src = "/proxy/" + encodeURIComponent(url);
        } else {
            player.src = url;
        }
        player.play();
    }

    function voltarParaPastas() { carregarPastas(); }

    function selecionarTipo(tipo) {
        tipoAtivo = tipo;
        document.getElementById('btn-canais').className = 'tab-btn';
        document.getElementById('btn-filmes').className = 'tab-btn';
        document.getElementById('btn-series').className = 'tab-btn';
        document.getElementById('btn-' + tipo).className = 'tab-btn active';
        carregarPastas();
    }

    function filtrarLista() {
        var filtro = document.getElementById('busca').value.toLowerCase();
        var itens = document.getElementById('listaPrincipal').getElementsByClassName('item-lista');
        for (var i = 0; i < itens.length; i++) {
            var txt = itens[i].innerText.toLowerCase();
            itens[i].style.display = (txt.indexOf(filtro) > -1) ? "" : "none";
        }
    }

    carregarPastas();
</script>
</body>
</html>
`;
