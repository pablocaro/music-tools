// Text Animation Functions
function typeWriter(element, text, speed = 100) {
  element.innerHTML = '';
  let i = 0;
  
  function type() {
    if (i < text.length) {
      element.innerHTML += text.charAt(i);
      i++;
      setTimeout(type, speed);
    }
  }
  type();
}

function fadeInText(element, delay = 0) {
  element.style.opacity = '0';
  element.style.transform = 'translateY(20px)';
  element.style.transition = 'opacity 0.8s ease, transform 0.8s ease';
  
  setTimeout(() => {
    element.style.opacity = '1';
    element.style.transform = 'translateY(0)';
  }, delay);
}

function animateCharacters(element, delay = 0) {
  const text = element.textContent;
  element.innerHTML = '';
  
  // Create spans for each character
  for (let i = 0; i < text.length; i++) {
    const span = document.createElement('span');
    span.textContent = text[i] === ' ' ? '\u00A0' : text[i]; // Non-breaking space
    span.style.opacity = '0';
    span.style.transform = 'translateY(20px)';
    span.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
    span.style.display = 'inline-block';
    element.appendChild(span);
  }
  
  // Animate each character
  const spans = element.querySelectorAll('span');
  spans.forEach((span, index) => {
    setTimeout(() => {
      span.style.opacity = '1';
      span.style.transform = 'translateY(0)';
    }, delay + (index * 50));
  });
}

function bounceIn(element, delay = 0) {
  element.style.opacity = '0';
  element.style.transform = 'scale(0.5)';
  element.style.transition = 'opacity 0.6s ease, transform 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55)';
  
  setTimeout(() => {
    element.style.opacity = '1';
    element.style.transform = 'scale(1)';
  }, delay);
}

// Initialize animations when page loads
document.addEventListener('DOMContentLoaded', function() {
  const h1 = document.querySelector('h1');
  const p = document.querySelector('p');
  const footer = document.querySelector('footer');
  const button = document.querySelector('button');
  
  // Store original text
  const originalH1Text = h1.textContent;
  const originalPText = p.textContent;
  
  // Animate elements with different effects
  bounceIn(h1, 200);
  animateCharacters(p, 800);
  fadeInText(button, 1500);
  fadeInText(footer, 2000);
  
  // Add click animation to button
  button.addEventListener('click', function() {
    this.style.transform = 'scale(0.95)';
    setTimeout(() => {
      this.style.transform = 'scale(1)';
    }, 150);
  });
  
  // Add hover animation to title
  h1.addEventListener('mouseenter', function() {
    this.style.transform = 'scale(1.05) rotate(1deg)';
    this.style.transition = 'transform 0.3s ease';
  });
  
  h1.addEventListener('mouseleave', function() {
    this.style.transform = 'scale(1) rotate(0deg)';
  });
  
  // Restart animations function (can be called externally)
  window.restartAnimations = function() {
    // Reset and restart all animations
    h1.textContent = originalH1Text;
    p.textContent = originalPText;
    
    // Clear any existing transitions
    [h1, p, button, footer].forEach(el => {
      el.style.transition = 'none';
      el.style.transform = '';
      el.style.opacity = '';
    });
    
    // Restart with a small delay
    setTimeout(() => {
      bounceIn(h1, 100);
      animateCharacters(p, 600);
      fadeInText(button, 1200);
      fadeInText(footer, 1600);
    }, 50);
  };
});

// Add some sparkle effect for fun
function createSparkle() {
  const sparkle = document.createElement('div');
  sparkle.innerHTML = '✨';
  sparkle.style.position = 'fixed';
  sparkle.style.left = Math.random() * window.innerWidth + 'px';
  sparkle.style.top = Math.random() * window.innerHeight + 'px';
  sparkle.style.pointerEvents = 'none';
  sparkle.style.fontSize = Math.random() * 20 + 10 + 'px';
  sparkle.style.opacity = '0.8';
  sparkle.style.animation = 'sparkle 2s ease-out forwards';
  
  document.body.appendChild(sparkle);
  
  setTimeout(() => {
    sparkle.remove();
  }, 2000);
}

// Add sparkle animation CSS
const sparkleCSS = `
  @keyframes sparkle {
    0% {
      opacity: 0.8;
      transform: translateY(0) rotate(0deg) scale(1);
    }
    50% {
      opacity: 1;
      transform: translateY(-20px) rotate(180deg) scale(1.2);
    }
    100% {
      opacity: 0;
      transform: translateY(-40px) rotate(360deg) scale(0);
    }
  }
`;

// Add sparkle CSS to document
const style = document.createElement('style');
style.textContent = sparkleCSS;
document.head.appendChild(style);

// Trigger sparkles occasionally
setInterval(() => {
  if (Math.random() < 0.3) { // 30% chance every 3 seconds
    createSparkle();
  }
}, 3000);