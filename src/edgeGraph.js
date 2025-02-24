class EdgeGraph {
    constructor(container, data) {
        this.container = container;
        this.data = data;
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.simulation = null;
        this.nodes = [];
        this.links = [];
        this.transform = d3.zoomIdentity;
        this.minZoom = 0.1;
        this.maxZoom = 4;
        this.dragging = false;
        this.selectedNode = null;
        this.clusterThreshold = 3;
        
        this.init();
    }

    init() {
        // Setup canvas size
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());

        // Process data
        this.processData(this.data);

        // Calculate initial positions before simulation
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        const radius = Math.min(this.canvas.width, this.canvas.height) / 4;
        
        // Position nodes in a circle initially
        this.nodes.forEach((node, i) => {
            const angle = (i / this.nodes.length) * 2 * Math.PI;
            node.x = centerX + radius * Math.cos(angle);
            node.y = centerY + radius * Math.sin(angle);
        });

        // Setup zoom behavior first
        this.setupZoom();
        
        // Fit view to content immediately with initial positions
        this.fitViewToContent();

        // Setup force simulation with adjusted parameters
        this.simulation = d3.forceSimulation(this.nodes)
            .force('link', d3.forceLink(this.links)
                .id(d => d.id)
                .distance(250))
            .force('charge', d3.forceManyBody()
                .strength(-600)
                .distanceMax(350))
            .force('collide', d3.forceCollide()
                .radius(65)
                .strength(0.7))
            .force('center', d3.forceCenter(
                this.canvas.width / 2,
                this.canvas.height / 2)
            )
            .velocityDecay(0.3)
            .alphaMin(0.001)
            .alphaDecay(0.0228)
            .on('tick', () => this.draw());

        // Setup interactions
        this.setupDrag();
    }

    resizeCanvas() {
        const rect = this.container.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        
        // Redraw after resize
        this.draw();
    }

    processData(data) {
        // Process nodes
        this.nodes = data.nodes.map(node => ({
            id: node.id,
            label: node.label,
            properties: node.properties,
            color: data.colors[node.properties.type] || '#999999',
            x: undefined,
            y: undefined
        }));

        // Process edges with proper source and target references
        this.links = data.edges.map(edge => ({
            source: this.nodes.find(n => n.id === edge.source_node_id),
            target: this.nodes.find(n => n.id === edge.target_node_id),
            relationship: edge.relationship_name,
            properties: edge.properties
        }));
    }

    draw() {
        // Clear and set background
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.save();
        // Apply zoom transform
        this.ctx.translate(this.transform.x, this.transform.y);
        this.ctx.scale(this.transform.k, this.transform.k);

        // Draw links with arrows and relationship labels
        this.links.forEach(link => {
            const sourceNode = link.source;
            const targetNode = link.target;
            
            if (sourceNode && targetNode && sourceNode.x != null && sourceNode.y != null && 
                targetNode.x != null && targetNode.y != null) {
                
                const nodeRadius = 60;  // Match the new node size
                // Calculate direction vector
                const dx = targetNode.x - sourceNode.x;
                const dy = targetNode.y - sourceNode.y;
                const length = Math.sqrt(dx * dx + dy * dy);
                
                if (length === 0) return;

                // Check if this is part of a bidirectional relationship
                const bidirectionalPair = this.getBidirectionalPair(link);
                
                // Normalize direction vector
                const unitX = dx / length;
                const unitY = dy / length;

                // Offset for bidirectional links
                let offsetX = 0;
                let offsetY = 0;
                if (bidirectionalPair) {
                    offsetX = -unitY * 15; // Perpendicular offset
                    offsetY = unitX * 15;
                    // Only draw if this is the first of the pair
                    if (link.source.id > link.target.id) return;
                }

                // Calculate start and end points with offset
                const startX = sourceNode.x + unitX * nodeRadius + offsetX;
                const startY = sourceNode.y + unitY * nodeRadius + offsetY;
                const endX = targetNode.x - unitX * nodeRadius + offsetX;
                const endY = targetNode.y - unitY * nodeRadius + offsetY;

                // Draw the line
                this.ctx.beginPath();
                this.ctx.moveTo(startX, startY);
                this.ctx.lineTo(endX, endY);
                this.ctx.strokeStyle = '#ffffff';
                this.ctx.lineWidth = 1.5;
                this.ctx.stroke();

                // Draw the arrow head
                const arrowLength = 15;  // Increased from 12 to 15
                const arrowWidth = Math.PI / 12;
                const angle = Math.atan2(dy, dx);

                this.ctx.beginPath();
                this.ctx.moveTo(endX, endY);
                this.ctx.lineTo(
                    endX - arrowLength * Math.cos(angle - arrowWidth),
                    endY - arrowLength * Math.sin(angle - arrowWidth)
                );
                this.ctx.lineTo(
                    endX - arrowLength * Math.cos(angle + arrowWidth),
                    endY - arrowLength * Math.sin(angle + arrowWidth)
                );
                this.ctx.closePath();
                this.ctx.fillStyle = '#ffffff';
                this.ctx.fill();

                // Calculate text position (always above the line)
                const midX = (startX + endX) / 2;
                const midY = (startY + endY) / 2;

                // Calculate angle but don't flip text
                let textAngle = Math.atan2(dy, dx);
                // Ensure text is always readable from left to right
                if (textAngle > Math.PI / 2 || textAngle < -Math.PI / 2) {
                    textAngle = textAngle - Math.PI;
                }

                this.ctx.save();
                this.ctx.translate(midX, midY);
                this.ctx.rotate(textAngle);

                // Draw relationship name closer to the line
                this.ctx.font = '12px Arial';
                this.ctx.fillStyle = '#ffffff';
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'bottom';
                this.ctx.fillText(link.relationship, 0, -8);  // Changed from -12 to -8 to be closer to line

                this.ctx.restore();

                // If bidirectional, draw the reverse arrow and text
                if (bidirectionalPair) {
                    // Draw reverse arrow at opposite offset
                    const reverseStartX = sourceNode.x + unitX * nodeRadius - offsetX;
                    const reverseStartY = sourceNode.y + unitY * nodeRadius - offsetY;
                    const reverseEndX = targetNode.x - unitX * nodeRadius - offsetX;
                    const reverseEndY = targetNode.y - unitY * nodeRadius - offsetY;

                    // Draw reverse line
                    this.ctx.beginPath();
                    this.ctx.moveTo(reverseStartX, reverseStartY);
                    this.ctx.lineTo(reverseEndX, reverseEndY);
                    this.ctx.stroke();

                    // Draw reverse arrow head
                    this.ctx.beginPath();
                    this.ctx.moveTo(reverseStartX, reverseStartY);
                    this.ctx.lineTo(
                        reverseStartX + arrowLength * Math.cos(angle - arrowWidth),
                        reverseStartY + arrowLength * Math.sin(angle - arrowWidth)
                    );
                    this.ctx.lineTo(
                        reverseStartX + arrowLength * Math.cos(angle + arrowWidth),
                        reverseStartY + arrowLength * Math.sin(angle + arrowWidth)
                    );
                    this.ctx.closePath();
                    this.ctx.fill();

                    // Draw reverse relationship text
                    this.ctx.save();
                    this.ctx.translate((reverseStartX + reverseEndX) / 2, (reverseStartY + reverseEndY) / 2);
                    this.ctx.rotate(textAngle);
                    this.ctx.fillStyle = '#ffffff';
                    this.ctx.textAlign = 'center';
                    this.ctx.textBaseline = 'bottom';
                    this.ctx.fillText(bidirectionalPair.relationship, 0, -8);  // Changed from -12 to -8
                    this.ctx.restore();
                }
            }
        });

        // Draw nodes last so they appear on top
        this.nodes.forEach(node => {
            if (node.x == null || node.y == null) return;
            
            const nodeRadius = 60;  // Increased node size
            
            // Draw node circle without border
            this.ctx.beginPath();
            this.ctx.arc(node.x, node.y, nodeRadius, 0, 2 * Math.PI);
            this.ctx.fillStyle = node.color;
            this.ctx.fill();

            // Draw node label inside the circle
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = 'bold 14px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            
            // Wrap text to fit inside node
            const maxWidth = nodeRadius * 1.5;  // Maximum width for text
            const lines = this.wrapText(node.label, maxWidth);
            const lineHeight = 16;
            const totalHeight = lines.length * lineHeight;
            
            // Draw each line of text
            lines.forEach((line, index) => {
                const y = node.y - (totalHeight / 2) + (index * lineHeight) + (lineHeight / 2);
                this.ctx.fillText(line, node.x, y);
            });
        });

        this.ctx.restore();
    }

    setupDrag() {
        let draggedNode = null;
        let dragStartPosition = null;

        const dragSubject = (event) => {
            // Get mouse position in canvas coordinates
            const point = d3.pointer(event, this.canvas);
            // Transform to simulation coordinates
            const x = (point[0] - this.transform.x) / this.transform.k;
            const y = (point[1] - this.transform.y) / this.transform.k;

            // Find the closest node
            const node = this.nodes.find(n => {
                const dx = x - (n.x || 0);
                const dy = y - (n.y || 0);
                return dx * dx + dy * dy < 400; // Increased hit area
            });

            return node;
        };

        const drag = d3.drag()
            .container(this.canvas)
            .subject(dragSubject)
            .on('start', (event) => {
                if (!event.subject) return;
                
                draggedNode = event.subject;
                dragStartPosition = d3.pointer(event, this.canvas);
                
                // Stop any ongoing simulation
                this.simulation.alphaTarget(0.3).restart();
                
                // Fix the node in place during drag
                draggedNode.fx = draggedNode.x;
                draggedNode.fy = draggedNode.y;
            })
            .on('drag', (event) => {
                if (!draggedNode) return;
                
                // Update node position
                draggedNode.fx = (event.x - this.transform.x) / this.transform.k;
                draggedNode.fy = (event.y - this.transform.y) / this.transform.k;
                
                // Keep simulation running
                this.simulation.alpha(0.3).restart();
            })
            .on('end', (event) => {
                if (!draggedNode || !dragStartPosition) return;

                // Check if this was a click (not a drag)
                const endPoint = d3.pointer(event, this.canvas);
                const dx = endPoint[0] - dragStartPosition[0];
                const dy = endPoint[1] - dragStartPosition[1];
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < 5) {
                    console.log('Click detected on node:', draggedNode);
                    if (draggedNode.collapsed) {
                        this.expandCluster(draggedNode);
                    } else if (draggedNode.children && draggedNode.children.length > 0) {
                        this.collapseCluster(draggedNode);
                    }
                }

                // Release the node
                draggedNode.fx = null;
                draggedNode.fy = null;
                
                this.simulation.alphaTarget(0);
                draggedNode = null;
                dragStartPosition = null;
            });

        d3.select(this.canvas).call(drag);
    }

    expandCluster(node) {
        console.log('Expanding node:', node);
        
        if (!node.originalData.children || node.originalData.children.length === 0) {
            console.log('No children to expand');
            return;
        }
        
        // Mark the node as expanded
        node.collapsed = false;
        
        const angleStep = (2 * Math.PI) / node.originalData.children.length;
        const radius = 100; // Distance from parent
        
        node.originalData.children.forEach((childData, index) => {
            const angle = index * angleStep;
            
            const childNode = {
                id: childData.id,
                children: [],
                depth: node.depth + 1,
                collapsed: childData.children && childData.children.length > this.clusterThreshold,
                childCount: childData.children ? childData.children.length : 0,
                originalData: childData,
                // Position around parent with some randomness
                x: node.x + radius * Math.cos(angle) * (0.9 + Math.random() * 0.2),
                y: node.y + radius * Math.sin(angle) * (0.9 + Math.random() * 0.2)
            };
            
            this.nodes.push(childNode);
            this.links.push({
                source: node.id,
                target: childNode.id
            });
            node.children.push(childNode);
        });
        
        // Update simulation with higher alpha to ensure proper layout
        this.simulation.nodes(this.nodes);
        this.simulation.force('link').links(this.links);
        this.simulation.alpha(1).restart();
    }

    collapseCluster(node) {
        console.log('Collapsing node:', node);
        
        // Mark the node as collapsed
        node.collapsed = true;
        
        // Remove all descendant nodes and their links
        const descendantIds = new Set();
        const getDescendants = (n) => {
            n.children.forEach(child => {
                descendantIds.add(child.id);
                getDescendants(child);
            });
        };
        getDescendants(node);
        
        // Filter out the descendants
        this.nodes = this.nodes.filter(n => !descendantIds.has(n.id));
        this.links = this.links.filter(l => 
            !descendantIds.has(l.source.id) && 
            !descendantIds.has(l.target.id)
        );
        
        // Clear the node's children array
        node.children = [];
        
        // Update simulation
        this.simulation.nodes(this.nodes);
        this.simulation.force('link').links(this.links);
        this.simulation.alpha(1).restart();
    }

    getBidirectionalPair(currentLink) {
        return this.links.find(link => 
            link !== currentLink && 
            link.source.id === currentLink.target.id && 
            link.target.id === currentLink.source.id
        );
    }

    // Add this helper function to the class to wrap text
    wrapText(text, maxWidth) {
        const words = text.split(' ');
        const lines = [];
        let currentLine = words[0];

        for (let i = 1; i < words.length; i++) {
            const word = words[i];
            const width = this.ctx.measureText(currentLine + " " + word).width;
            if (width < maxWidth) {
                currentLine += " " + word;
            } else {
                lines.push(currentLine);
                currentLine = word;
            }
        }
        lines.push(currentLine);
        return lines;
    }

    setupZoom() {
        const zoom = d3.zoom()
            .scaleExtent([this.minZoom, this.maxZoom])
            .on('zoom', (event) => {
                this.transform = event.transform;
                this.draw();
            });

        d3.select(this.canvas)
            .call(zoom)
            .call(zoom.transform, d3.zoomIdentity);
    }

    fitViewToContent() {
        // Calculate bounds
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        
        this.nodes.forEach(node => {
            if (node.x == null || node.y == null) return;
            const radius = 60; // Node radius
            minX = Math.min(minX, node.x - radius);
            maxX = Math.max(maxX, node.x + radius);
            minY = Math.min(minY, node.y - radius);
            maxY = Math.max(maxY, node.y + radius);
        });

        // Add consistent padding
        const edgePadding = 40;  // Increased from 20 to 40
        const viewPadding = 60;  // Increased from 40 to 60
        
        // Adjust bounds with padding
        minX -= edgePadding;
        maxX += edgePadding;
        minY -= edgePadding;
        maxY += edgePadding;

        // Calculate dimensions
        const width = this.canvas.width - (viewPadding * 2);
        const height = this.canvas.height - (viewPadding * 2);
        const graphWidth = maxX - minX;
        const graphHeight = maxY - minY;
        
        // Calculate scale to fit content with additional scaling factor
        const scale = Math.min(
            width / graphWidth,
            height / graphHeight,
            0.8  // Reduced from 0.9 to 0.8 to zoom out more
        );

        // Calculate translation to center and account for padding
        const tx = viewPadding + (-minX * scale) + (width - graphWidth * scale) / 2;
        const ty = viewPadding + (-minY * scale) + (height - graphHeight * scale) / 2;

        // Apply transform
        const transform = d3.zoomIdentity
            .translate(tx, ty)
            .scale(scale);

        d3.select(this.canvas)
            .call(d3.zoom().transform, transform);

        this.transform = transform;
        this.draw();
    }
}
