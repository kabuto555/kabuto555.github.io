---
layout: default
title: Projects
---
# Projects

Here are my current and past projects!


{% for project in site.data.projects %}
## {{ project.name }}
{{ project.details }}
<br><br>
{% endfor %}