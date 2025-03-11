# D3 Edge Graph Visualization Generator

A tool to generate interactive, force-directed graph visualizations with nodes and edges using D3.js and HTML Canvas.

## Live Demo

Try the interactive visualization example: [https://edge-node-d3.vercel.app/](https://edge-node-d3.vercel.app/)

![Example Graph Visualization](example.png)

## Features

- Force-directed graph layout
- Interactive node dragging
- Directional arrows showing relationships
- Bidirectional relationship support
- Color-coded nodes by type
- Auto-wrapping node labels
- Smooth animations
- Canvas-based rendering for better performance

## Prerequisites

- Node.js installed on your system
- A modern web browser

## Project Structure

```
d3-edge-graph/
├── src/
│   ├── edgeGraph.js        # Core visualization implementation
│   └── generateNodeTree.js # Generator script
├── examples/
│   └── example_data.json  # Example data structure
├── package.json           # Project configuration
├── README.md             # Documentation
└── .gitignore           # Git ignore rules
```

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/d3-edge-graph.git
cd d3-edge-graph
```

2. Install dependencies:
```bash
npm install
```

## Usage

### Using npm scripts

1. Generate visualization from example data:
```bash
npm run example
```

2. Generate visualization from your own data:
```bash
npm run generate path/to/your/data.json
```

### Using node directly
```bash
node src/generateNodeTree.js path/to/your/data.json
```

## Data Format

Your JSON data should follow this structure:
```json
{
  "configuration": {
    "logo": {
      "url": "path/to/logo.png",
      "position": "bottomRight",
      "size": 100,
      "padding": 20
    }
  },
  "nodes": [{
    "id": 1,
    "label": "Joseph Gordon-Levitt",
    "properties": {
      "name": "Joseph Gordon-Levitt",
      "description": "This is Joseph Gordon-Levitt",
      "type": "Actor"
    }
  }],
  "edges": [{
    "source_node_id": 1,
    "target_node_id": 4,
    "relationship_name": "ACTED_IN",
    "properties": {
      "role": "Arthur"
    }
  }],
  "colors": {
    "Actor": "#ff0000",
    "Director": "#00ff00",
    "Film": "#0000ff"
  }
}
```

### Data Structure Explanation

The JSON structure consists of four main parts:

1. **Configuration**: Global settings for the visualization
   - `logo`: Settings for displaying a logo in the graph

2. **Nodes**: Array of nodes with properties
   - `id`: Unique identifier
   - `label`: Display name
   - `properties`: Additional information including type

3. **Edges**: Array of relationships between nodes
   - `source_node_id`: ID of the source node
   - `target_node_id`: ID of the target node
   - `relationship_name`: Type of relationship
   - `properties`: Additional relationship information

4. **Colors**: Color mapping for different node types

## Configuration Options

The EdgeGraph can be customized in two ways:

### 1. Through the JSON configuration object:

```json
"configuration": {
  "logo": {
    "url": "path/to/logo.png",
    "position": "bottomRight",
    "size": 100,
    "padding": 20
  }
}
```

### 2. Through constructor options:

```javascript
// Create a new graph with custom options
const edgeGraph = new EdgeGraph(container, data, {
    logoUrl: 'path/to/your/logo.png',
    logoPosition: 'bottomRight',
    logoSize: 100,
    logoPadding: 20
});
```

Note: Configuration in the JSON file takes precedence over constructor options.

### Logo Options

You can display a custom logo in the corner of your graph:

- **url/logoUrl**: Path to the logo image file
- **position/logoPosition**: Where to position the logo (bottomRight, bottomLeft, topRight, topLeft)
- **size/logoSize**: Maximum dimension of the logo in pixels (preserves aspect ratio)
- **padding/logoPadding**: Padding from the edge of the canvas in pixels

## Interaction Guide

- **Drag nodes**: Click and drag any node to reposition it
- **Click on a node**: Opens an information box showing all the node's properties
- **Node colors**: Defined in the colors object for each node type
- **Arrows**: Show relationship direction between nodes
- **Labels**: 
  - Node labels appear inside nodes
  - Relationship names appear above arrows
- **Click on empty space**: Closes any open node info box
- **Click and drag on empty space**: Pans the entire graph
- **Mouse wheel**: Zooms in and out of the graph

### Node Info Box

When clicking on a node (without dragging), an information box will appear showing:
- The node's ID and label
- All properties from the node's `properties` object
- The node's type in the header with matching color

To customize what information is displayed in this box, add the desired data to the node's `properties` object in your JSON data. **All properties defined in your JSON file under a node's `properties` object will automatically be shown as key-value pairs in the info box.** This makes it easy to display any custom data you want to be viewable when users interact with your graph.

Example property display:
```json
"properties": {
  "name": "Joseph Gordon-Levitt",  // Will show as "name: Joseph Gordon-Levitt"
  "born": "1981",                  // Will show as "born: 1981"
  "oscars": "0",                   // Will show as "oscars: 0"
  "type": "Actor"                  // Used for coloring, but also shown in the header
}
```

## Technical Details

### Visualization Features
- Force-directed layout for automatic node positioning
- Canvas rendering for better performance
- Automatic text wrapping in nodes
- Bidirectional relationship handling
- Interactive drag and click functionality
- Smooth animations for expanding/collapsing nodes

### Dependencies
- D3.js v7.0.0 for force simulation and interactions
- HTML5 Canvas for rendering
- Node.js for generating the visualization file

## Troubleshooting

1. If the visualization is not showing:
   - Check your JSON file format
   - Ensure all files are in the same directory
   - Check browser console for errors

2. If nodes are not draggable:
   - Make sure you're using a modern browser
   - Check if D3.js is loading correctly

3. If clustering is not working:
   - Verify your JSON structure
   - Check that nodes have proper `children` arrays

## Limitations

- Best suited for graphs with less than 1000 nodes
- Requires modern browser with Canvas support
- JSON file must be valid and follow the required structure

## Contributing

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/my-new-feature`
3. Commit your changes: `git commit -am 'Add some feature'`
4. Push to the branch: `git push origin feature/my-new-feature`
5. Submit a pull request

## Attribution

Originally developed by [Bojan Dragojevic](https://github.com/Kibo007)

## License

This project is licensed under the MIT License.

## Support

If you encounter any issues or have questions:
1. Check the troubleshooting section
2. Look through existing issues
3. Create a new issue with:
   - Your JSON data structure
   - Steps to reproduce the problem
   - Browser and system information 