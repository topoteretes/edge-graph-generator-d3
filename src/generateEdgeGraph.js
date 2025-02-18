const fs = require('fs');
const path = require('path');

// Read input JSON file path from command line arguments
const jsonPath = process.argv[2];

if (!jsonPath) {
    console.error('Please provide a path to JSON file');
    console.error('Usage: node generateNodeTree.js path/to/data.json');
    process.exit(1);
}

// Read and parse JSON data
let jsonData;
try {
    const jsonContent = fs.readFileSync(jsonPath, 'utf8');
    jsonData = JSON.parse(jsonContent);
} catch (error) {
    console.error('Error reading or parsing JSON file:', error.message);
    process.exit(1);
}

// Template for the HTML file
const htmlTemplate = `<!DOCTYPE html>
<html>
<head>
    <title>D3 Node Tree Visualization</title>
    <style>
        #canvas-container {
            position: relative;
            width: 100%;
            height: 100vh;
        }
        canvas {
            position: absolute;
            top: 0;
            left: 0;
        }
    </style>
</head>
<body>
    <div id="canvas-container">
        <canvas id="canvas"></canvas>
    </div>
    <script src="https://d3js.org/d3.v7.min.js"></script>
    <script>
        // Node tree implementation
        ${fs.readFileSync(path.join(__dirname, 'edgeGraph.js'), 'utf8')}

        // Initialize with the provided data
        const graphData = ${JSON.stringify(jsonData, null, 2)};
        
        document.addEventListener('DOMContentLoaded', () => {
            const container = document.getElementById('canvas-container');
            const edgeGraph = new EdgeGraph(container, graphData);
        });
    </script>
</body>
</html>`;

// Generate output file name based on input file
const outputPath = path.join(
    path.dirname(jsonPath),
    `${path.basename(jsonPath, '.json')}_visualization.html`
);

// Write the HTML file
try {
    fs.writeFileSync(outputPath, htmlTemplate);
    console.log(`Visualization generated successfully at: ${outputPath}`);
} catch (error) {
    console.error('Error writing HTML file:', error.message);
    process.exit(1);
} 