---
layout: default
title: Game Design
---
# 🎮 Game Design 🎮

These are my game design prototypes! All of these games are playable on web mobile or desktop!

{% for game in site.data.game_design %}
- ## {{ game.name }}
{% if game.image %}<img src="{{ game.image }}" width="100%"><br>{% endif %}{% if game.links %}[ {{ game.links }} ]<br>{% endif %}{{ game.details }}<br><br>
`Tech: {{ game.tech }}`
{% endfor %}
