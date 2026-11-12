---
layout: default
title: Clarky Lee
---
# Clarky Lee

## 🐧 Software and Game Developer 🐻

<img src="/assets/images/clarky.jpg" width="350" class="center">

<p align=center>🎮 Crafting joyful player experiences with code and design. 🕹️</p>

_I'm a software and game developer with a passion for building intuitive and enjoyable experiences, and then juicing the hell outta them. I specialize in Unity and mobile games, but also have experience in mobile apps, web frontend and backend systems. Whether it's RPG mechanics, card battle systems, juicing and polishing gameplay or UI, or data-heavy features, I enjoy solving interesting design and technical problems and delivering responsive experiences._

<br>

# Recent Projects
{% for project in site.data.projects limit:2 %}
- ### {{ project.name }}
{% if project.image %}<img src="/assets/images/{{ project.image }}" width="100%"><br>{% endif %}{% if project.links %}[ {{ project.links }} ]<br>{% endif %}{{ project.details }}<br><br>
`Tech: {{ project.tech }}`
{% endfor %}

See more [Projects](/pages/projects.html)!