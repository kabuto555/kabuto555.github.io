---
layout: default
title: Fun Projects
---
# 🎉 Fun Projects 🎉

Here are some of the fun side projects that are not game related I've been tinkering with!

{% for project in site.data.fun_projects %}
- ## {{ project.name }}
{% if project.image %}<img src="/assets/images/{{ project.image }}" width="{% if project.image_width %}{{ project.image_width }}{% else %}100%{% endif %}"><br>{% endif %}{% if project.links %}[ {{ project.links }} ]<br>{% endif %}{{ project.details }}<br><br>
`Tech: {{ project.tech }}`
{% endfor %}
