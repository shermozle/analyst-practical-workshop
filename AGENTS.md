# Workshop factory

A framework for building hands on training workshops to show Amplitude and Statsig to our customers, prospects and community members. It's important that the users get to play in a real application, trying different approaches as they learn more, but with a gentle on-ramp that gives them good results easily.

## Inputs

* Who is the audience?
  - What is their technical skill level?
  - What do you want them to walk out knowing?
* What features are you introducing?
* Which ones should they get to use hands on vs on screen demo?
* What should the toy application be?

## Outputs

* Slides
* Self-contained web application for attendees to use where they will instrument Amplitude or Statsig
* Talk track

## Technology

* Hub site
    - HTML page in Github Pages with links to the other components.
* Slides
    - HTML slide deck
    - Deployed to Github Pages
* Web application
    - Deployed to Github Pages
    - No state saves server-side: all state to be stored in querystring parameters on the URL
* Talk track: self-contained HTML page
    - Deployed to Github Pages

# Voice

* Use direct, simple language
* Slides should make at most 3 points. No walls of text on slides
* Use visuals, diagrams and animations to explain complex concepts
* Interactive visualisations can be very powerful: showing the impact of changes to one or two values through sliders is great (See `examples/Experiment Basics Workshop.html`)
* Use the deslop skill to remove all the AI slop