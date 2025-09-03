document.addEventListener('DOMContentLoaded', function() {
  // Toggle the mobile menu
  var menuButton = document.querySelector('.menu-button');
  var siteNav = document.querySelector('.site-nav');

  menuButton.addEventListener('click', function(e) {
    e.preventDefault();
    siteNav.classList.toggle('is-open');
  });

  // Generate the table of contents
  var toc = document.getElementById('toc');
  if (toc) {
    var headings = document.querySelectorAll('section h1, section h2, section h3, section h4, section h5, section h6');
    var tocList = document.createElement('ul');

    headings.forEach(function(heading) {
      if (heading.id) {
        var listItem = document.createElement('li');
        var link = document.createElement('a');

        link.textContent = heading.textContent;
        link.href = '#' + heading.id;

        listItem.appendChild(link);
        tocList.appendChild(listItem);
      }
    });

    toc.appendChild(tocList);
  }
});