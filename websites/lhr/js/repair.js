document.getElementById('calculator').addEventListener('submit', function (e) {
    e.preventDefault();

    const device = document.getElementById('device').value;
    const partCost = parseFloat(document.getElementById('partCost').value);
    const laborTime = parseFloat(document.getElementById('laborTime').value);

    let shippingCost, overheadCost, profit;

    if (device === 'phone/tablet') {
        shippingCost = 15;
        overheadCost = (laborTime / 60) * 70;
        profit = overheadCost * 1.28;
    } else if (device === 'computer') {
        shippingCost = 20;
        overheadCost = (laborTime / 60) * 70;
        profit = overheadCost * 2;
    } else { // Soldering (Any)
        shippingCost = 60;
        overheadCost = (laborTime / 60) * 70;
        profit = overheadCost * 2;
    }

    const subtotal = partCost + shippingCost + overheadCost + profit;
    const royalties = subtotal * 0.075;
    const totalCost = subtotal + royalties;

    const resultsDiv = document.getElementById('results');
    resultsDiv.innerHTML = `
        <p>Shipping, Processing, & Replacement Risk: $${shippingCost.toFixed(2)}</p>
        <p>Overhead/Labor Costs: $${overheadCost.toFixed(2)}</p>
        <p>Profits: $${profit.toFixed(2)}</p>
        <p>Subtotal: $${subtotal.toFixed(2)}</p>
        <p style="display: none;">Royalties: $${royalties.toFixed(2)}</p>
        <p><strong>Price to Charge the Customer: $${totalCost.toFixed(2)}</strong></p>
    `;
});