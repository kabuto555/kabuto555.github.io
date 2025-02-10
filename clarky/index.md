---
layout: default
title: Clarky Lee
---
# Clarky Lee

## 🐧 Software and Game Developer 🐻

🎮 Crafting joyful player experiences with code and design.

_I'm a software and game developer with a passion for building fun and well crafted experiences. I specialize in Unity/C# and Godot games on mobile, desktop and WebGL, but also have experience in general web development and backend systems. Whether it's RPG mechanics or card battle systems, I enjoy solving interesting design problems and crafting responsive gameplay._

## Recent Projects
{% for project in site.data.projects limit:2 %}
### {{ project.name }}
{{ project.details }}
<br><br>
{% endfor %}