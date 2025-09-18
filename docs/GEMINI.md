# GEMINI Project Context: CS01 Docs

## Directory Overview

This directory contains the source code for a Jekyll-based static website. The website is an interactive case study titled "NewCo Term Sheet Negotiation: A Case Study," designed for law students, business students, and entrepreneurs. It simulates a real-world negotiation between a technology startup (NewCo) and a corporate investor (BigTech) to teach concepts of venture financing and intellectual property commercialization.

The content is organized into several modules, covering the foundations of the deal, the term sheet, the negotiation exercise, and financials. There is also a separate section with confidential materials for instructors.

## Key Files

*   `_config.yml`: The main Jekyll configuration file. It sets the site's theme, title, and description.
*   `index.md` & `*.md`: These Markdown files represent the core content of the website. Each file corresponds to a page or a module in the case study.
*   `_data/navigation.yml`: This YAML file defines the structure of the main navigation menu for the website, linking to the different modules.
*   `instructor/`: This directory contains materials specifically for instructors or facilitators of the case study, including guides and confidential information.
*   `_layouts/`, `_includes/`, `assets/`: These are standard Jekyll directories that control the site's HTML structure, reusable components, and assets like CSS and JavaScript.
*   `Gemfile`: This file lists the Ruby gems (dependencies) required to build and run the Jekyll site, specifically using the `github-pages` gem to ensure compatibility.
*   `_site/`: This directory contains the fully generated static website. **Note:** This directory is the output of the build process and should not be edited directly, as any changes will be overwritten.

## Usage and Development

This is a Jekyll project. To work with it locally, you will need Ruby and Bundler installed.

1.  **Install Dependencies:**
    Navigate to this directory in your terminal and run the following command to install the required gems specified in the `Gemfile`:
    ```bash
    bundle install
    ```

2.  **Run the Local Server:**
    To build the site and serve it locally, run:
    ```bash
    bundle exec jekyll serve
    ```

3.  **View the Site:**
    Once the server is running, you can view the website by opening your browser and navigating to `http://localhost:4000`.

Any changes made to the Markdown files (`.md`) or other source files will be automatically detected, and the site will be regenerated.
