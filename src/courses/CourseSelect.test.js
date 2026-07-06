// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { createCourseSelect, LAST_COURSE_KEY } from './CourseSelect.js';

const COURSES = [
  { id: 'cutgate', name: 'Cut Gate', description: 'Margery Hill to Upper Derwent Visitor Centre', bbox: { minE: 418200, minN: 395600, maxE: 419800, maxN: 399300 } },
  { id: 'roych', name: 'The Roych', description: 'Edale to Chapel-en-le-Frith', bbox: { minE: 405000, minN: 383000, maxE: 407000, maxN: 385000 } },
];

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = `
    <div id="course-select" hidden>
      <div id="course-select-map"></div>
      <ul id="course-select-list"></ul>
    </div>
  `;
});

describe('createCourseSelect', () => {
  it('renders one list button per course', () => {
    createCourseSelect(COURSES).show();
    const buttons = document.querySelectorAll('#course-select-list button');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].textContent).toContain('Cut Gate');
    expect(buttons[1].textContent).toContain('The Roych');
  });

  it('renders one marker per course, positioned from its bbox', () => {
    createCourseSelect(COURSES).show();
    const markers = document.querySelectorAll('#course-select-map .course-marker');
    expect(markers).toHaveLength(2);
    expect(markers[0].style.left).not.toBe('');
    expect(markers[0].style.top).not.toBe('');
  });

  it('resolves with the chosen course and persists it when a list button is clicked', async () => {
    const promise = createCourseSelect(COURSES).show();
    document.querySelectorAll('#course-select-list button')[1].click();
    const chosen = await promise;
    expect(chosen.id).toBe('roych');
    expect(localStorage.getItem(LAST_COURSE_KEY)).toBe('roych');
    expect(document.getElementById('course-select').hidden).toBe(true);
  });

  it('resolves with the chosen course when its marker is clicked', async () => {
    const promise = createCourseSelect(COURSES).show();
    document.querySelectorAll('#course-select-map .course-marker')[0].click();
    const chosen = await promise;
    expect(chosen.id).toBe('cutgate');
    expect(localStorage.getItem(LAST_COURSE_KEY)).toBe('cutgate');
  });

  it('defaults to the first course when nothing is in localStorage', () => {
    createCourseSelect(COURSES).show();
    const buttons = document.querySelectorAll('#course-select-list button');
    expect(buttons[0].classList.contains('is-default')).toBe(true);
    expect(buttons[1].classList.contains('is-default')).toBe(false);
  });

  it('defaults to the last-selected course from localStorage', () => {
    localStorage.setItem(LAST_COURSE_KEY, 'roych');
    createCourseSelect(COURSES).show();
    const buttons = document.querySelectorAll('#course-select-list button');
    expect(buttons[0].classList.contains('is-default')).toBe(false);
    expect(buttons[1].classList.contains('is-default')).toBe(true);
  });
});
