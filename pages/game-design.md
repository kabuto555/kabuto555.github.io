---
layout: default
title: Game Design
---
<style>
  .game-gallery {
    scrollbar-width: thin;
    scrollbar-color: #555 transparent;
  }
  .game-gallery::-webkit-scrollbar {
    height: 8px;
  }
  .game-gallery::-webkit-scrollbar-track {
    background: transparent;
  }
  .game-gallery::-webkit-scrollbar-thumb {
    background: #555;
    border-radius: 4px;
  }
  .game-gallery::-webkit-scrollbar-thumb:hover {
    background: #777;
  }
</style>

# 🎮 Game Design 🎮

These are my game design prototypes! All of these games are playable on web mobile or desktop!

{% for game in site.data.game_design %}
- ## {{ game.name }}
{% if game.screenshots %}<span class="game-gallery" style="display: flex; gap: 15px; overflow-x: auto; padding: 10px 0 15px 0; max-width: 100%;">{% for img in game.screenshots %}<img src="{{ img }}" style="height: 400px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); border: 2px solid #333; flex-shrink: 0;">{% endfor %}</span>{% endif %}{% if game.image %}<img src="{{ game.image }}" width="100%"><br>{% endif %}{% if game.links %}[ {{ game.links }} ]{% endif %}{% if game.control %} <span style="font-style: italic; color: #aaa; margin-left: 10px;">({{ game.control }})</span>{% endif %}{% if game.hackathon %} <span style="color: #FFD700; font-weight: bold; margin-left: 10px; background: rgba(0,0,0,0.2); padding: 2px 6px; border-radius: 4px;">[{{ game.hackathon }}]</span>{% endif %}<br>{{ game.details }}<br><br>
`Tech: {{ game.tech }}`
{% endfor %}
