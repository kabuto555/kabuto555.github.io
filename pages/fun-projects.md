---
layout: default
title: Fun Projects
---
# 🎉 Fun Projects 🎉

Here are some of the fun side projects that are not game related I've been tinkering with!

{% for project in site.data.fun_projects %}
{% assign anchor = project.name | split: '<br>' | first | strip_html | slugify %}{% if project.id %}{% assign anchor = project.id %}{% endif %}
- ## [{{ project.name }}](#{{ anchor }}) {#{{ anchor }}}
{% if project.image %}<img src="/assets/images/{{ project.image }}" width="{% if project.image_width %}{{ project.image_width }}{% else %}100%{% endif %}"><br>{% endif %}{% if project.links %}[ {{ project.links }} ]<br>{% endif %}{% if project.downloads %}<span class="downloads">{% for dl in project.downloads %}<a class="button download-button" href="{{ dl.url }}"><span class="download-icon">{{ dl.icon }}</span><span class="download-text"><strong>{{ dl.label }}</strong><small>{{ dl.detail }}</small></span></a>{% endfor %}</span>{% if project.download_note %}<span class="download-note">{{ project.download_note }}</span>{% endif %}{% endif %}{{ project.details }}<br><br>
`Tech: {{ project.tech }}`
{% endfor %}
