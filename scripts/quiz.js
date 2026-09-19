document.addEventListener('DOMContentLoaded', function() {
  const quizzes = document.querySelectorAll('.quiz-container');

  quizzes.forEach((quiz, quizIndex) => {
    const question = quiz.querySelector('.quiz-question');
    const optionsContainer = quiz.querySelector('.quiz-options');
    const checkBtn = quiz.querySelector('.check-btn');
    const feedback = quiz.querySelector('.quiz-feedback');
    const correctIndex = parseInt(quiz.dataset.correctIndex);
    if (!question || !optionsContainer || !checkBtn || !feedback) return;

    const quizId = 'knowledge-check-' + (quizIndex + 1);
    const header = quiz.querySelector('.quiz-header');
    const icon = quiz.querySelector('.quiz-header i');
    const fieldset = document.createElement('fieldset');
    const legend = document.createElement('legend');
    const originalOptions = Array.from(optionsContainer.querySelectorAll('.quiz-option'));
    const feedbackId = quizId + '-feedback';

    quiz.dataset.quizReady = 'true';
    if (header) {
      header.id = quizId + '-header';
    }
    if (icon) icon.setAttribute('aria-hidden', 'true');

    fieldset.className = 'quiz-fieldset';
    legend.className = 'quiz-question';
    while (question.firstChild) legend.appendChild(question.firstChild);
    question.replaceWith(fieldset);
    fieldset.append(legend, optionsContainer);

    originalOptions.forEach((option, optionIndex) => {
      const optionId = quizId + '-option-' + (optionIndex + 1);
      const label = document.createElement('label');
      const radio = document.createElement('input');
      const text = document.createElement('span');

      label.className = option.className;
      label.htmlFor = optionId;
      radio.className = 'quiz-radio';
      radio.type = 'radio';
      radio.name = quizId;
      radio.id = optionId;
      radio.value = String(optionIndex);
      text.className = 'quiz-option-text';
      while (option.firstChild) text.appendChild(option.firstChild);
      label.append(radio, text);
      option.replaceWith(label);
    });

    const options = Array.from(optionsContainer.querySelectorAll('.quiz-option'));
    const radios = Array.from(optionsContainer.querySelectorAll('.quiz-radio'));
    const practiceNote = document.createElement('p');
    practiceNote.className = 'small';
    practiceNote.textContent = 'Practice only — this does not affect course completion.';
    checkBtn.before(practiceNote);
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'btn btn-outline-primary quiz-retry';
    retry.textContent = 'Try again';
    retry.hidden = true;
    checkBtn.after(retry);
    retry.addEventListener('click', () => {
      options.forEach(option => { option.classList.remove('correct', 'incorrect', 'selected'); option.querySelectorAll('.quiz-result-label').forEach(item => item.remove()); });
      radios.forEach(radio => { radio.disabled = false; radio.checked = false; });
      selectedIndex = -1;
      checkBtn.textContent = 'Check Answer';
      checkBtn.disabled = true;
      feedback.hidden = true;
      retry.hidden = true;
      radios[0].focus();
    });
    checkBtn.type = 'button';
    checkBtn.disabled = true;
    checkBtn.setAttribute('aria-describedby', feedbackId);
    feedback.id = feedbackId;
    feedback.hidden = true;
    feedback.setAttribute('role', 'status');
    feedback.setAttribute('aria-live', 'polite');
    feedback.setAttribute('aria-atomic', 'true');
    let selectedIndex = -1;

    radios.forEach((radio, index) => {
      radio.addEventListener('change', () => {
        if (radio.disabled) return;
        options.forEach(opt => opt.classList.remove('selected'));
        options[index].classList.add('selected');
        selectedIndex = index;
        checkBtn.disabled = false;
      });
    });

    checkBtn.addEventListener('click', () => {
      if (selectedIndex === -1) return;

      checkBtn.disabled = true;
      checkBtn.textContent = 'Answer checked';
      retry.hidden = false;
      radios.forEach(radio => radio.disabled = true);

      const selectedOption = options[selectedIndex];
      const correctOption = options[correctIndex];

      function addResultLabel(option, message) {
        const result = document.createElement('span');
        result.className = 'quiz-result-label';
        result.textContent = message;
        option.querySelector('.quiz-option-text').appendChild(result);
      }

      if (selectedIndex === correctIndex) {
        selectedOption.classList.add('correct');
        selectedOption.classList.remove('selected');
        addResultLabel(selectedOption, 'Your answer — correct');
        feedback.textContent = quiz.dataset.correctFeedback || "Correct! Great job.";
        feedback.className = 'quiz-feedback correct';
      } else {
        selectedOption.classList.add('incorrect');
        selectedOption.classList.remove('selected');
        correctOption.classList.add('correct');
        addResultLabel(selectedOption, 'Your answer — incorrect');
        addResultLabel(correctOption, 'Correct answer');
        feedback.textContent = quiz.dataset.incorrectFeedback || "Not quite. The correct answer is highlighted.";
        feedback.className = 'quiz-feedback incorrect';
      }
      feedback.hidden = false;
    });
  });
});
