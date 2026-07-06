import { projectToOverview } from './courseGeometry.js';

// Persisted last-chosen course, same flat-string pattern as main.js's MUSIC_MUTED_KEY /
// ScoreTracker.js's SCORE_BEST_KEY / DevTools.js's DEVTOOLS_VISIBLE_KEY.
export const LAST_COURSE_KEY = 'lastCourseId';

// Pre-run course-select overlay: shows a Peak-District overview map with a marker per
// course (positioned from each course's real-world bbox, not a hardcoded pixel position)
// plus an accessible/keyboard-navigable fallback list. Resolves once the player picks one.
export function createCourseSelect(courses) {
  const overlay = document.getElementById('course-select');
  const mapEl = document.getElementById('course-select-map');
  const listEl = document.getElementById('course-select-list');
  if (!overlay || !listEl) {
    return { show: async () => courses[0] };
  }

  const lastId = localStorage.getItem(LAST_COURSE_KEY);
  const defaultCourse = courses.find((course) => course.id === lastId) ?? courses[0];

  return {
    show() {
      return new Promise((resolve) => {
        function choose(course) {
          localStorage.setItem(LAST_COURSE_KEY, course.id);
          overlay.hidden = true;
          resolve(course);
        }

        listEl.replaceChildren();
        mapEl?.replaceChildren();

        let defaultButton = null;

        for (const course of courses) {
          const listButton = document.createElement('button');
          listButton.type = 'button';
          listButton.className = 'course-option';
          listButton.textContent = `${course.name} — ${course.description}`;
          listButton.addEventListener('click', () => choose(course));
          const li = document.createElement('li');
          li.appendChild(listButton);
          listEl.appendChild(li);

          if (course === defaultCourse) {
            listButton.classList.add('is-default');
            defaultButton = listButton;
          }

          if (!mapEl) continue;

          const { xPercent, yPercent } = projectToOverview(course.bbox);
          const marker = document.createElement('button');
          marker.type = 'button';
          marker.className = 'course-marker';
          marker.style.left = `${xPercent}%`;
          marker.style.top = `${yPercent}%`;
          marker.setAttribute('aria-label', course.name);
          marker.title = course.name;
          marker.addEventListener('click', () => choose(course));
          mapEl.appendChild(marker);

          if (course === defaultCourse) {
            marker.classList.add('is-default');
            defaultButton = marker;
          }
        }

        overlay.hidden = false;
        defaultButton?.focus();
      });
    },
  };
}
