const form = document.querySelector('.form');
const nameInput = document.getElementById('name');
const emailInput = document.getElementById('email');
const phoneInput = document.getElementById('phone');
const messageInput = document.getElementById('message');
const submitButton = document.getElementById('submitBtn');

submitButton.addEventListener('click', function(e) {
    e.preventDefault();

    // Get form field values
    const name = nameInput.value;
    const email = emailInput.value;
    const phone = phoneInput.value;
    const message = messageInput.value;

    // Save form data in LocalStorage
    const formData = {
        name,
        email,
        phone,
        message
    };
    localStorage.setItem('formData', JSON.stringify(formData));

    // Create email body
    const emailBody = `${message} %0D%0A %0D%0A ${name} %0D%0A ${phone} %0D%0A ${email}`;

    // Create the subject line
    const subject = `Contact Request from ${name}`;

    // Use mailto to open the default email client with pre-filled information
    window.location.href = `mailto:smartelectronicssolutionsllc@gmail.com?subject=${encodeURIComponent(subject)}&body=${emailBody}`;
});

document.addEventListener('DOMContentLoaded', function() {

    const emailText = document.getElementById('email-text');
  
    function copyToClipboard(text) {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
  
    emailText.addEventListener('click', function() {
      copyToClipboard(emailText.textContent);
  
      emailText.textContent = 'Email Copied to Clipboard.';
      emailText.style.color = 'green';
  
      setTimeout(() => {
        emailText.textContent = 'Luis@SmartElectronicsSolutions.com';
        emailText.style.color = '';
      }, 2000);
    });
  });
  