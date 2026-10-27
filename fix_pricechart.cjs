const fs = require('fs');
const content = fs.readFileSync('C:/Users/Administrator/OneDrive/Documents/pesakicoke/src/components/terminal/PriceChart.tsx', 'utf8');

// Fix the arrow character in the template literal
let fixed = content.replace('ctx.fillText(`${symbol} ▼ ${tf}`, 8, 15);', 'ctx.fillText(symbol + " ▼ " + tf, 8, 15);');

// Fix the comment characters
fixed = fixed.replace('// â”€â”€â”€ CHART TOP-LEFT TEXT OVERLAY â”€â”€â”€', '// --- CHART TOP-LEFT TEXT OVERLAY ---');
fixed = fixed.replace('// â”€â”€â”€ POSITION LINES (Dashed with white bg) - Fix overlapping labels â”€â”€â”€', '// --- POSITION LINES (Dashed with white bg) - Fix overlapping labels ---');

// Write the fixed content
fs.writeFileSync('C:/Users/Administrator/OneDrive/Documents/pesakicoke/src/components/terminal/PriceChart.tsx', fixed, 'utf8');
console.log('Fixed');