---
layout: default
title: Projects
---
# 👾 Projects 👾

Here are my current and past projects!

{% for project in site.data.projects %}
- ## {{ project.name }}
{% if project.image %}<img src="/assets/images/{{ project.image }}" width="100%"><br>{% endif %}{% if project.links %}[{{ project.links }}]<br>{% endif %}{{ project.details }}<br><br>
`Tech: {{ project.tech }}`
{% endfor %}