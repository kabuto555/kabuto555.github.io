---
layout: default
title: Game Design
---
# 🎮 Game Design 🎮

These are my game design prototypes! All of these games are playable on web mobile or desktop!

{% for game in site.data.game_design %}
- ## {{ game.name }}
{% if game.screenshots %}<span style="display: flex; gap: 15px; overflow-x: auto; padding: 10px 0 15px 0; max-width: 100%;">{% for img in game.screenshots %}<img src="{{ img }}" style="height: 400px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); border: 2px solid #333; flex-shrink: 0;">{% endfor %}</span>{% endif %}{% if game.image %}<img src="{{ game.image }}" width="100%"><br>{% endif %}{% if game.links %}[ {{ game.links }} ]<br>{% endif %}{{ game.details }}<br><br>
`Tech: {{ game.tech }}`
{% endfor %}
