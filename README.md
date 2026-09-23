# METROPOLIS: Genesis

## Etapas implementadas

O protótipo agora cobre as etapas 2–5 em uma base única:

- **Etapa 2 — Vida urbana:** agentes visuais representam moradores, alternam entre casa e trabalho e dependem de zonas existentes.
- **Etapa 3 — Crescimento:** edifícios têm idade e nível; a evolução depende de acesso viário, demanda e passagem de dias.
- **Etapa 4 — Infraestrutura:** energia, água, poluição, parques e serviços afetam os indicadores da cidade.
- **Etapa 5 — Gestão:** receita diária, manutenção implícita, eventos periódicos, felicidade, congestionamento e mapa de tráfego.

Também foi incluído:

- zoom por roda do mouse
- interação por Pointer Events para mouse, caneta e toque
- layout responsivo para iPad/iPadOS
- manifest de aplicativo instalável
- service worker para carregamento offline depois da primeira visita
- salvamento local da cidade

## Rodar no iPad

Abra o repositório publicado em um navegador com HTTPS. No Safari, use **Compartilhar → Adicionar à Tela de Início**. Em desenvolvimento local, a instalação do service worker exige HTTPS ou `localhost`.

## Limite honesto

Este é um jogo web/protótipo funcional, não um simulador AAA. As próximas etapas podem aprofundar rotas reais, semáforos, economia detalhada, campanhas, áudio, multiplayer e VR, mas cada uma deve ser testada separadamente para preservar estabilidade.
