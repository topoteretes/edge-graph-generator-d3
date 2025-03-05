class EdgeGraph {
    constructor(container, data) {
        this.container = container;
        this.data = data;
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        
        // Configuration constants with increased spacing
        this.config = {
            nodeRadius: 80, // Increased from 60
            arrowLength: 20, // Increased from 15
            arrowWidth: Math.PI / 10, // Wider arrows
            lineWidth: 2, // Thicker lines
            font: '16px Arial', // Larger font
            boldFont: 'bold 16px Arial',
            lineHeight: 18,
            bidirectionalOffset: 20, // Increased from 15
            textOffset: 8,
            edgePadding: 60, // Increased padding
            viewPadding: 100, // More view padding
            levelSpacing: 350, // Vertical spacing between levels
            nodeSpacing: 250 // Minimum horizontal spacing between nodes
        };
        
        this.simulation = null;
        this.nodes = [];
        this.links = [];
        this.transform = d3.zoomIdentity;
        this.minZoom = 0.05; // Lower min zoom to see more of large graphs
        this.maxZoom = 5;
        this.dragging = false;
        this.selectedNode = null;
        this.clusterThreshold = 3;
        this.infoBox = {
            visible: false,
            x: 0,
            y: 0,
            width: 300,
            height: 0,
            padding: 15
        };
        
        this.init();
    }

    init() {
        // Setup canvas size
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());

        // Process data
        this.processData(this.data);

        // Position nodes intelligently by type rather than just in a circle
        this.organizeInitialPositions();

        // Setup zoom behavior first
        this.setupZoom();
        
        // Fit view to content immediately with initial positions
        this.fitViewToContent();

        // Setup force simulation with significantly increased spacing
        this.simulation = d3.forceSimulation(this.nodes)
            .force('link', d3.forceLink(this.links)
                .id(d => d.id)
                .distance(d => {
                    // Dynamically set link distance based on relationship
                    return this.getLinkDistance(d);
                }))
            .force('charge', d3.forceManyBody()
                .strength(-2500)  // Much stronger repulsion
                .distanceMax(1500)) // Increased range substantially
            .force('collide', d3.forceCollide()
                .radius(this.config.nodeRadius * 2.5)  // Even larger collision radius
                .strength(0.95)  // Near-maximum collision strength
                .iterations(5))  // More iterations for better positioning
            .force('center', d3.forceCenter(
                this.canvas.width / 2,
                this.canvas.height / 2)
            )
            // Use hierarchy-aware clustering force
            .force('typeCluster', this.createTypeClusterForce())
            // Add relationship-based positioning force
            .force('relationshipPositioning', this.createRelationshipForce())
            // Reduce overall movement for more stability
            .velocityDecay(0.5) // Higher dampening
            .alphaMin(0.0005)
            .alphaDecay(0.01) // Slower decay for better settling
            .on('tick', () => this.draw());

        // Setup interactions
        this.setupDrag();

        // Setup click handler for node selection
        this.setupNodeSelection();
    }

    resizeCanvas() {
        const rect = this.container.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        
        // Redraw after resize
        this.draw();
    }

    processData(data) {
        if (!data || !data.nodes || !data.edges) {
            console.error('Invalid data format:', data);
            return;
        }
        
        try {
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

            // Pre-compute bidirectional pairs
            this.bidirectionalPairs = new Map();
            
            for (let i = 0; i < this.links.length; i++) {
                const link1 = this.links[i];
                for (let j = i + 1; j < this.links.length; j++) {
                    const link2 = this.links[j];
                    if (link1.source.id === link2.target.id && link1.target.id === link2.source.id) {
                        this.bidirectionalPairs.set(link1, link2);
                        this.bidirectionalPairs.set(link2, link1);
                        break;
                    }
                }
            }
        } catch (error) {
            console.error('Error processing graph data:', error);
        }
    }

    draw() {
        this.clearCanvas();
        
        // Draw graph elements with transformation
        this.ctx.save();
        this.applyTransform();
        this.drawLinks();
        this.drawNodes();
        this.ctx.restore();
        
        // Draw UI elements without transformation (in screen space)
        if (this.selectedNode && this.infoBox.visible) {
            this.drawInfoBox();
        }
    }

    clearCanvas() {
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    applyTransform() {
        this.ctx.translate(this.transform.x, this.transform.y);
        this.ctx.scale(this.transform.k, this.transform.k);
    }

    drawLinks() {
        this.links.forEach(link => this.drawLink(link));
    }

    drawLink(link) {
        const sourceNode = link.source;
        const targetNode = link.target;
        
        if (sourceNode && targetNode && sourceNode.x != null && sourceNode.y != null && 
            targetNode.x != null && targetNode.y != null) {
            
            const nodeRadius = this.config.nodeRadius;  // Match the new node size
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
                offsetX = -unitY * this.config.bidirectionalOffset; // Perpendicular offset
                offsetY = unitX * this.config.bidirectionalOffset;
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
            this.ctx.lineWidth = this.config.lineWidth;
            this.ctx.stroke();

            // Draw the arrow head
            const arrowLength = this.config.arrowLength;  // Increased from 12 to 15
            const arrowWidth = this.config.arrowWidth;
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

            // Draw relationship text
            this.ctx.save();
            this.ctx.translate(midX, midY);
            this.ctx.rotate(textAngle);

            // Consistent text styling
            this.ctx.font = this.config.font;
            this.ctx.fillStyle = '#ffffff';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'bottom';
            this.ctx.fillText(link.relationship, 0, -this.config.textOffset);  // Changed from -10 to -6

            this.ctx.restore();

            // If bidirectional, draw the reverse relationship text
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

                // Draw reverse relationship text with same styling
                this.ctx.save();
                this.ctx.translate((reverseStartX + reverseEndX) / 2, (reverseStartY + reverseEndY) / 2);
                this.ctx.rotate(textAngle);
                this.ctx.font = this.config.font;
                this.ctx.fillStyle = '#ffffff';
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'bottom';
                this.ctx.fillText(bidirectionalPair.relationship, 0, -this.config.textOffset);  // Changed from -10 to -6
                this.ctx.restore();
            }
        }
    }

    drawNodes() {
        this.nodes.forEach(node => {
            if (node.x == null || node.y == null) return;
            if (!this.isNodeVisible(node)) return;
            this.drawNode(node);
        });
    }

    drawNode(node) {
        if (node.x == null || node.y == null) return;
        
        const nodeRadius = this.config.nodeRadius;  // Increased node size
        
        // Draw node circle without border
        this.ctx.beginPath();
        this.ctx.arc(node.x, node.y, nodeRadius, 0, 2 * Math.PI);
        this.ctx.fillStyle = node.color;
        this.ctx.fill();

        // Draw node label inside the circle
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = this.config.boldFont;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        
        // Wrap text to fit inside node
        const maxWidth = nodeRadius * 1.5;  // Maximum width for text
        const lines = this.wrapText(node.label, maxWidth);
        const lineHeight = this.config.lineHeight;
        const totalHeight = lines.length * lineHeight;
        
        // Draw each line of text
        lines.forEach((line, index) => {
            const y = node.y - (totalHeight / 2) + (index * lineHeight) + (lineHeight / 2);
            this.ctx.fillText(line, node.x, y);
        });
    }

    setupDrag() {
        let draggedNode = null;

        const dragSubject = (event) => {
            const point = d3.pointer(event, this.canvas);
            const simPoint = this.transformPointToSimulation(point);
            
            return this.findNodeAtPoint(simPoint.x, simPoint.y);
        };

        const drag = d3.drag()
            .container(this.canvas)
            .filter(event => !event.button && !event.ctrlKey)
            .subject(dragSubject)
            .on('start', this.handleDragStart.bind(this))
            .on('drag', this.handleDrag.bind(this))
            .on('end', this.handleDragEnd.bind(this));

        d3.select(this.canvas).call(drag);
    }

    transformPointToSimulation(point) {
        return {
            x: (point[0] - this.transform.x) / this.transform.k,
            y: (point[1] - this.transform.y) / this.transform.k
        };
    }

    findNodeAtPoint(x, y) {
        return this.nodes.find(n => {
            if (n.x == null || n.y == null) return false;
            const dx = x - n.x;
            const dy = y - n.y;
            return dx * dx + dy * dy < (this.config.nodeRadius * this.config.nodeRadius);
        });
    }

    handleDragStart(event) {
        if (!event.subject) return;
        
        // Prevent info box from showing after a drag operation
        this.infoBox.visible = false;
        
        this.draggedNode = event.subject;
        this.dragging = true;
        
        // Set grabbing cursor during drag
        document.body.style.cursor = 'grabbing';
        
        // Save original collision strength and increase during drag
        this.originalCollideStrength = this.simulation.force('collide').strength();
        this.simulation.force('collide')
            .radius(this.config.nodeRadius * 1.6)  // Increased from 1.1 to 1.6
            .strength(1);
        
        // Fix node position
        this.draggedNode.fx = this.draggedNode.x;
        this.draggedNode.fy = this.draggedNode.y;
        
        // Don't completely stop the simulation, just reduce alpha
        this.simulation.alphaTarget(0.1).restart();
    }

    handleDrag(event) {
        if (!this.draggedNode) return;
        
        // Get mouse position in simulation space
        const point = this.transformPointToSimulation(d3.pointer(event, this.canvas));
        
        // Update node position
        this.draggedNode.x = point.x;
        this.draggedNode.y = point.y;
        this.draggedNode.fx = point.x;
        this.draggedNode.fy = point.y;
        
        // Apply collision avoidance - push other nodes away
        this.applyCollisionAvoidance();
        
        this.draw();
    }

    handleDragEnd() {
        if (!this.draggedNode) return;
        
        this.dragging = false;
        
        // Reset cursor
        document.body.style.cursor = 'default';
        
        // Restore original collision settings
        this.simulation.force('collide')
            .radius(this.config.nodeRadius * 1.5)
            .strength(this.originalCollideStrength || 0.8);
        
        this.draggedNode = null;
        
        // Restart simulation but with lower alpha - just enough to adjust other nodes
        this.simulation.alphaTarget(0).alpha(0.1).restart();
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

    getBidirectionalPair(link) {
        return this.bidirectionalPairs.get(link);
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
            .filter(event => {
                // Allow zoom with wheel/pinch and panning with drag when not on a node
                if (event.type === 'wheel' || event.type === 'touchmove') {
                    return !this.dragging;
                }
                
                // For mousedown events (start of drag), check if we're on a node
                if (event.type === 'mousedown') {
                    const point = this.transformPointToSimulation(d3.pointer(event, this.canvas));
                    const nodeUnderMouse = this.findNodeAtPoint(point.x, point.y);
                    // Allow panning only when not clicking on a node
                    return !nodeUnderMouse;
                }
                
                // Allow other events (like mousemove for panning)
                return true;
            })
            .on('zoom', (event) => {
                this.transform = event.transform;
                this.draw();
            });

        d3.select(this.canvas)
            .call(zoom)
            .call(zoom.transform, d3.zoomIdentity);
    }

    fitViewToContent() {
        if (this.nodes.length === 0) return;
        
        // Calculate graph bounds with extreme padding
        const nodeRadius = this.config.nodeRadius;
        
        // Find min/max positions with node radius considered
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        
        this.nodes.forEach(node => {
            if (node.x == null || node.y == null) return;
            
            // Use even larger multipliers for node radius
            minX = Math.min(minX, node.x - nodeRadius * 8);
            maxX = Math.max(maxX, node.x + nodeRadius * 8);
            minY = Math.min(minY, node.y - nodeRadius * 8);
            maxY = Math.max(maxY, node.y + nodeRadius * 8);
        });
        
        // Get canvas dimensions
        const width = this.canvas.width;
        const height = this.canvas.height;
        
        // Calculate the dimensions of the graph content
        const graphWidth = maxX - minX;
        const graphHeight = maxY - minY;
        
        // Force a very aggressive zoom out factor - much smaller number means more zoomed out
        let scale = 0.15;
        
        // Calculate the minimum scale needed to fit all content with padding
        const fitScaleWidth = (width * 0.85) / graphWidth;
        const fitScaleHeight = (height * 0.85) / graphHeight;
        
        // Use the smaller of our fixed scale or what's needed to fit content
        scale = Math.min(scale, fitScaleWidth, fitScaleHeight);
        
        console.log("Graph dimensions:", graphWidth, "x", graphHeight);
        console.log("Canvas dimensions:", width, "x", height);
        console.log("Initial zoom scale:", scale);
        
        // Calculate the center of the graph content in its original coordinates
        const graphCenterX = (minX + maxX) / 2;
        const graphCenterY = (minY + maxY) / 2;
        
        // Calculate the canvas center
        const canvasCenterX = width / 2;
        const canvasCenterY = height / 2;
        
        // Calculate translation to center the graph in the canvas
        const tx = canvasCenterX - (graphCenterX * scale);
        const ty = canvasCenterY - (graphCenterY * scale);
        
        console.log("Translation:", tx, ty);
        
        // Apply transform with the correct centering
        const transform = d3.zoomIdentity
            .translate(tx, ty)
            .scale(scale);
        
        // Apply the zoom transform immediately and also with a delay as a fallback
        d3.select(this.canvas)
            .call(d3.zoom().transform, transform);
        
        this.transform = transform;
        this.draw();
        
        // Apply again after a delay in case the initial attempt doesn't work
        setTimeout(() => {
            d3.select(this.canvas)
                .call(d3.zoom().transform, transform);
            
            this.transform = transform;
            this.draw();
            
            console.log("Zoom transform reapplied:", transform);
        }, 500);
    }

    isNodeVisible(node) {
        const visibleMinX = -this.transform.x / this.transform.k;
        const visibleMinY = -this.transform.y / this.transform.k;
        const visibleMaxX = (this.canvas.width - this.transform.x) / this.transform.k;
        const visibleMaxY = (this.canvas.height - this.transform.y) / this.transform.k;
        
        const r = this.config.nodeRadius;
        return (
            node.x + r > visibleMinX &&
            node.x - r < visibleMaxX &&
            node.y + r > visibleMinY &&
            node.y - r < visibleMaxY
        );
    }

    // Add this new method to handle collision avoidance
    applyCollisionAvoidance() {
        const draggedNode = this.draggedNode;
        const nodeRadius = this.config.nodeRadius;
        const minDistance = nodeRadius * 3;  // Increased from 2 to 3 times the radius
        const repulsionStrength = 0.3;  // Increased from 0.2 to 0.3
        
        // For each node, check if it's too close to the dragged node
        this.nodes.forEach(node => {
            if (node === draggedNode) return; // Skip the dragged node
            
            // Calculate distance between nodes
            const dx = node.x - draggedNode.x;
            const dy = node.y - draggedNode.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // If nodes are too close
            if (distance < minDistance) {
                // Calculate the overlap amount
                const overlap = minDistance - distance;
                
                // Calculate normalized direction vector
                let dirX = dx, dirY = dy;
                if (distance > 0) {
                    dirX = dx / distance;
                    dirY = dy / distance;
                } else {
                    // If nodes are exactly at the same position, move in a random direction
                    const angle = Math.random() * 2 * Math.PI;
                    dirX = Math.cos(angle);
                    dirY = Math.sin(angle);
                }
                
                // Push the other node away along the direction vector
                // The repulsion strength determines how quickly nodes move away
                const isFixed = node.fx !== null && node.fy !== null;
                
                if (isFixed) {
                    // For fixed nodes, temporarily shift them to avoid overlap
                    // but preserve their fixed position for simulation
                    node.x += dirX * overlap * repulsionStrength * 0.5;
                    node.y += dirY * overlap * repulsionStrength * 0.5;
                    
                    // Update fx,fy to match the slightly adjusted position
                    node.fx = node.x;
                    node.fy = node.y;
                } else {
                    // For non-fixed nodes, apply full repulsion
                    node.x += dirX * overlap * repulsionStrength;
                    node.y += dirY * overlap * repulsionStrength;
                    
                    // Apply velocity for smoother movement
                    const velocityDamping = 0.5;
                    if (!node.vx) node.vx = 0;
                    if (!node.vy) node.vy = 0;
                    node.vx += dirX * overlap * repulsionStrength * velocityDamping;
                    node.vy += dirY * overlap * repulsionStrength * velocityDamping;
                }
            }
        });
    }

    // New method that analyzes graph structure and arranges nodes in a hierarchical layout
    organizeInitialPositions() {
        // Analyze the graph to determine hierarchical relationships
        this.computeNodeHierarchy();
        
        const canvas = this.canvas;
        const width = canvas.width;
        const height = canvas.height;
        
        // Group nodes by their hierarchical level and type
        const levelGroups = {};
        const maxLevel = Math.max(...this.nodes.map(n => n.level || 0));
        
        this.nodes.forEach(node => {
            const level = node.level || 0;
            const type = node.properties && node.properties.type ? node.properties.type : 'default';
            
            if (!levelGroups[level]) {
                levelGroups[level] = {};
            }
            
            if (!levelGroups[level][type]) {
                levelGroups[level][type] = [];
            }
            
            levelGroups[level][type].push(node);
        });
        
        // Enhanced positioning with increased spacing
        Object.keys(levelGroups).forEach(level => {
            const levelNumber = parseInt(level);
            // Use the configuration parameter for level spacing
            const yPosition = (height * 0.1) + (levelNumber / Math.max(1, maxLevel)) * (height * 0.8);
            const typeGroups = levelGroups[level];
            
            // For each type within this level
            const typeCount = Object.keys(typeGroups).length;
            const typeKeys = Object.keys(typeGroups);
            
            typeKeys.forEach((type, typeIndex) => {
                const nodes = typeGroups[type];
                
                // Horizontal position with more space between type groups
                const sectionWidth = width / (typeCount + 1);
                const xCenter = sectionWidth * (typeIndex + 1);
                
                // Arrange nodes of this type in this level with more spacing
                const nodeCount = nodes.length;
                // Use the configuration parameter for node spacing
                const spacing = Math.max(this.config.nodeSpacing, sectionWidth / (nodeCount + 1));
                
                nodes.forEach((node, i) => {
                    let xOffset = 0;
                    
                    // For larger groups, use a grid layout
                    if (nodeCount > 7) {
                        const rowSize = Math.ceil(Math.sqrt(nodeCount * 1.5)); // Wider rows
                        const row = Math.floor(i / rowSize);
                        const col = i % rowSize;
                        xOffset = (col - rowSize/2) * spacing;
                        node.y = yPosition + row * spacing;
                    } else {
                        // For smaller groups, use a horizontal layout
                        xOffset = (i - (nodeCount - 1) / 2) * spacing;
                        node.y = yPosition;
                    }
                    
                    node.x = xCenter + xOffset;
                    
                    // Move important nodes (ones with many connections) to the center
                    if (node.childCount > 5 || node.parentCount > 5) {
                        node.x = Math.max(width * 0.3, Math.min(width * 0.7, node.x));
                    }
                });
            });
        });
        
        // Second pass to separate nodes that might be too close
        this.resolveOverlaps();
    }

    // New method to resolve initial node overlaps
    resolveOverlaps() {
        const nodeRadius = this.config.nodeRadius * 3; // Extra large minimum distance
        const iterations = 5;
        
        for (let iter = 0; iter < iterations; iter++) {
            let moved = false;
            
            for (let i = 0; i < this.nodes.length; i++) {
                const nodeA = this.nodes[i];
                
                for (let j = i + 1; j < this.nodes.length; j++) {
                    const nodeB = this.nodes[j];
                    
                    const dx = nodeB.x - nodeA.x;
                    const dy = nodeB.y - nodeA.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    
                    if (distance < nodeRadius) {
                        moved = true;
                        
                        // Calculate the overlap and direction
                        const overlap = nodeRadius - distance;
                        const dirX = dx / distance;
                        const dirY = dy / distance;
                        
                        // Move both nodes apart (slightly more for nodes on the same level)
                        const pushStrength = (nodeA.level === nodeB.level) ? 0.6 : 0.5;
                        
                        nodeA.x -= dirX * overlap * pushStrength;
                        nodeA.y -= dirY * overlap * pushStrength;
                        nodeB.x += dirX * overlap * pushStrength;
                        nodeB.y += dirY * overlap * pushStrength;
                    }
                }
            }
            
            if (!moved) break;
        }
    }

    // New method to analyze the graph and compute hierarchical levels for each node
    computeNodeHierarchy() {
        // Create a map of node IDs for quick lookup
        const nodeMap = {};
        this.nodes.forEach(node => {
            nodeMap[node.id] = node;
            // Initialize hierarchical properties
            node.level = undefined;
            node.childCount = 0;
            node.parentCount = 0;
        });
        
        // Count incoming and outgoing connections for each node
        this.links.forEach(link => {
            if (link.source && link.target) {
                // For source node, increment child count
                const sourceNode = typeof link.source === 'object' ? link.source : nodeMap[link.source];
                const targetNode = typeof link.target === 'object' ? link.target : nodeMap[link.target];
                
                if (sourceNode && targetNode) {
                    sourceNode.childCount = (sourceNode.childCount || 0) + 1;
                    targetNode.parentCount = (targetNode.parentCount || 0) + 1;
                }
            }
        });
        
        // Find root nodes (nodes with no incoming connections)
        const rootNodes = this.nodes.filter(node => (node.parentCount || 0) === 0);
        
        // If no clear roots, use nodes with the fewest incoming connections
        if (rootNodes.length === 0) {
            const minParents = Math.min(...this.nodes.map(n => n.parentCount || 0));
            rootNodes.push(...this.nodes.filter(n => (n.parentCount || 0) === minParents));
        }
        
        // Assign level 0 to root nodes
        rootNodes.forEach(node => {
            node.level = 0;
        });
        
        // Breadth-first traversal to assign levels
        const queue = [...rootNodes];
        const visited = new Set(rootNodes.map(n => n.id));
        
        while (queue.length > 0) {
            const currentNode = queue.shift();
            const childNodes = [];
            
            // Find all children of this node
            this.links.forEach(link => {
                if (typeof link.source === 'object' && link.source.id === currentNode.id) {
                    childNodes.push(typeof link.target === 'object' ? link.target : nodeMap[link.target]);
                } else if (link.source === currentNode.id) {
                    childNodes.push(typeof link.target === 'object' ? link.target : nodeMap[link.target]);
                }
            });
            
            // Process children
            childNodes.forEach(childNode => {
                if (childNode && !visited.has(childNode.id)) {
                    childNode.level = (currentNode.level || 0) + 1;
                    visited.add(childNode.id);
                    queue.push(childNode);
                }
            });
        }
        
        // Special case: handle cycles or unvisited nodes
        this.nodes.forEach(node => {
            if (node.level === undefined) {
                // For nodes in cycles, assign a level based on their connections
                const connectedNodes = [];
                
                this.links.forEach(link => {
                    if (typeof link.source === 'object' && link.source.id === node.id) {
                        const target = typeof link.target === 'object' ? link.target : nodeMap[link.target];
                        if (target && target.level !== undefined) connectedNodes.push(target);
                    } else if (link.source === node.id) {
                        const target = typeof link.target === 'object' ? link.target : nodeMap[link.target];
                        if (target && target.level !== undefined) connectedNodes.push(target);
                    }
                    
                    if (typeof link.target === 'object' && link.target.id === node.id) {
                        const source = typeof link.source === 'object' ? link.source : nodeMap[link.source];
                        if (source && source.level !== undefined) connectedNodes.push(source);
                    } else if (link.target === node.id) {
                        const source = typeof link.source === 'object' ? link.source : nodeMap[link.source];
                        if (source && source.level !== undefined) connectedNodes.push(source);
                    }
                });
                
                if (connectedNodes.length > 0) {
                    // Assign a level one below the average of connected nodes
                    const avgLevel = connectedNodes.reduce((sum, n) => sum + (n.level || 0), 0) / connectedNodes.length;
                    node.level = Math.floor(avgLevel) + 1;
                } else {
                    // Isolated nodes go at the top
                    node.level = 0;
                }
            }
        });
    }

    // Update the custom force to respect hierarchy
    createTypeClusterForce() {
        // Track nodes by level and type
        const nodesByLevelAndType = {};
        
        this.nodes.forEach(node => {
            const level = node.level || 0;
            const type = node.properties && node.properties.type ? node.properties.type : 'default';
            
            if (!nodesByLevelAndType[level]) {
                nodesByLevelAndType[level] = {};
            }
            
            if (!nodesByLevelAndType[level][type]) {
                nodesByLevelAndType[level][type] = [];
            }
            
            nodesByLevelAndType[level][type].push(node);
        });
        
        // Create more spread-out centers for each level+type combination
        const centers = {};
        const canvas = this.canvas;
        const width = canvas.width * 1.5; // Expand the effective width
        const height = canvas.height * 1.5; // Expand the effective height
        const maxLevel = Math.max(...this.nodes.map(n => n.level || 0));
        
        Object.keys(nodesByLevelAndType).forEach(level => {
            const levelNumber = parseInt(level);
            // More vertical space between levels
            const yPosition = (height * 0.1) + (levelNumber / Math.max(1, maxLevel)) * (height * 0.8);
            const typeGroups = nodesByLevelAndType[level];
            
            const typeCount = Object.keys(typeGroups).length;
            // Sort types by number of nodes (largest groups in the center)
            const sortedTypes = Object.keys(typeGroups).sort((a, b) => 
                typeGroups[b].length - typeGroups[a].length);
            
            sortedTypes.forEach((type, typeIndex) => {
                // Wider spacing between type groups
                const sectionWidth = width / (typeCount + 1);
                const xCenter = sectionWidth * (typeIndex + 1);
                
                centers[`${level}_${type}`] = {
                    x: xCenter,
                    y: yPosition
                };
            });
        });
        
        // Return a custom force function with adjusted strengths
        return function(alpha) {
            const verticalStrength = 0.4 * alpha; // Stronger vertical constraint
            const horizontalStrength = 0.2 * alpha; // Medium horizontal constraint
            
            for (const level in nodesByLevelAndType) {
                for (const type in nodesByLevelAndType[level]) {
                    const nodes = nodesByLevelAndType[level][type];
                    const center = centers[`${level}_${type}`];
                    
                    if (center) {
                        nodes.forEach(node => {
                            // Skip if the node is fixed (manually positioned)
                            if (node.fx !== null || node.fy !== null) return;
                            
                            // Apply different strengths for x and y
                            node.vx = (node.vx || 0) + (center.x - node.x) * horizontalStrength;
                            node.vy = (node.vy || 0) + (center.y - node.y) * verticalStrength;
                        });
                    }
                }
            }
        };
    }

    // Create a force that positions nodes based on their relationships
    createRelationshipForce() {
        // Build a relationship map to identify common patterns
        const relationshipMap = new Map();
        
        this.links.forEach(link => {
            const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
            const targetId = typeof link.target === 'object' ? link.target.id : link.target;
            const relType = link.relationship_name || 'unknown';
            
            if (!relationshipMap.has(sourceId)) {
                relationshipMap.set(sourceId, new Map());
            }
            if (!relationshipMap.has(targetId)) {
                relationshipMap.set(targetId, new Map());
            }
            
            const sourceRels = relationshipMap.get(sourceId);
            if (!sourceRels.has(relType)) {
                sourceRels.set(relType, new Set());
            }
            sourceRels.get(relType).add(targetId);
            
            // For bidirectional relationships
            const targetRels = relationshipMap.get(targetId);
            if (!targetRels.has(relType)) {
                targetRels.set(relType, new Set());
            }
            targetRels.get(relType).add(sourceId);
        });
        
        // Identify relationship clusters
        const relationshipClusters = new Map();
        let clusterIndex = 0;
        
        const nodeMap = {};
        this.nodes.forEach(node => {
            nodeMap[node.id] = node;
        });
        
        // Function to determine the primary relationship type for a node
        const getPrimaryRelationship = (nodeId) => {
            if (!relationshipMap.has(nodeId)) return null;
            
            const rels = relationshipMap.get(nodeId);
            let maxCount = 0;
            let primaryRel = null;
            
            for (const [relType, targets] of rels.entries()) {
                if (targets.size > maxCount) {
                    maxCount = targets.size;
                    primaryRel = relType;
                }
            }
            
            return primaryRel;
        };
        
        // Create clusters based on primary relationships
        this.nodes.forEach(node => {
            if (relationshipClusters.has(node.id)) return;
            
            const primaryRel = getPrimaryRelationship(node.id);
            if (!primaryRel) return;
            
            // Find related nodes with the same primary relationship
            const cluster = new Set([node.id]);
            const queue = [node.id];
            
            while (queue.length > 0) {
                const currentId = queue.shift();
                const currentRels = relationshipMap.get(currentId);
                
                if (!currentRels) continue;
                
                const targets = currentRels.get(primaryRel);
                if (!targets) continue;
                
                targets.forEach(targetId => {
                    if (!cluster.has(targetId) && getPrimaryRelationship(targetId) === primaryRel) {
                        cluster.add(targetId);
                        queue.push(targetId);
                    }
                });
            }
            
            // Assign all nodes in this cluster
            if (cluster.size > 1) {
                const clusterKey = `cluster_${clusterIndex++}`;
                cluster.forEach(id => {
                    relationshipClusters.set(id, clusterKey);
                });
            }
        });
        
        // Return a custom force function
        return (alpha) => {
            const clusterStrength = 0.2 * alpha;
            
            // Group nodes by relationship clusters
            const clusterPositions = new Map();
            
            // Calculate average positions for each cluster
            for (const [nodeId, clusterKey] of relationshipClusters.entries()) {
                const node = nodeMap[nodeId];
                if (!node || !node.x || !node.y) continue;
                
                if (!clusterPositions.has(clusterKey)) {
                    clusterPositions.set(clusterKey, {
                        x: 0, 
                        y: 0, 
                        count: 0
                    });
                }
                
                const pos = clusterPositions.get(clusterKey);
                pos.x += node.x;
                pos.y += node.y;
                pos.count++;
            }
            
            // Normalize cluster positions
            for (const [clusterKey, pos] of clusterPositions.entries()) {
                if (pos.count > 0) {
                    pos.x /= pos.count;
                    pos.y /= pos.count;
                }
            }
            
            // Apply gentle force to keep nodes in the same cluster together
            for (const [nodeId, clusterKey] of relationshipClusters.entries()) {
                const node = nodeMap[nodeId];
                if (!node || node.fx !== null || node.fy !== null) continue;
                
                const clusterPos = clusterPositions.get(clusterKey);
                if (!clusterPos) continue;
                
                // Pull toward cluster center
                node.vx = (node.vx || 0) + (clusterPos.x - node.x) * clusterStrength;
                node.vy = (node.vy || 0) + (clusterPos.y - node.y) * clusterStrength;
            }
        };
    }

    // New method to determine appropriate link distance based on relationship type
    getLinkDistance(link) {
        // Base distance is fairly large
        let distance = 500;
        
        // If source and target have different types, make the distance larger
        const sourceType = link.source.properties?.type;
        const targetType = link.target.properties?.type;
        if (sourceType && targetType && sourceType !== targetType) {
            distance += 150;
        }
        
        // If source and target are at different hierarchy levels, increase distance
        const sourceLvl = link.source.level || 0;
        const targetLvl = link.target.level || 0;
        if (sourceLvl !== targetLvl) {
            // Make vertical relationships longer
            distance += Math.abs(sourceLvl - targetLvl) * 200;
        }
        
        // Adjust distance based on relationship name if available
        if (link.relationship_name) {
            // These relationships often indicate primary connections
            if (link.relationship_name === "ACTED_IN" || 
                link.relationship_name === "DIRECTED" || 
                link.relationship_name === "PART_OF") {
                distance -= 100; // Shorter distance for primary relationships
            }
            
            // These are often secondary relationships
            if (link.relationship_name === "WORKED_WITH" || 
                link.relationship_name === "FREQUENT_COLLABORATOR") {
                distance += 150; // Longer distance for secondary relationships
            }
        }
        
        return distance;
    }

    // New method for node selection
    setupNodeSelection() {
        // Add mousemove handler to update cursor
        d3.select(this.canvas).on('mousemove', (event) => {
            if (this.dragging) return; // Skip during active dragging
            
            const point = d3.pointer(event, this.canvas);
            const simPoint = this.transformPointToSimulation(point);
            const nodeUnderMouse = this.findNodeAtPoint(simPoint.x, simPoint.y);
            
            // Set appropriate cursor
            if (nodeUnderMouse) {
                document.body.style.cursor = 'pointer'; // Pointer when hovering over a node
            } else {
                document.body.style.cursor = 'default'; // Default otherwise
            }
        });
        
        // Add mouseleave handler to reset cursor
        d3.select(this.canvas).on('mouseleave', () => {
            if (!this.dragging) {
                document.body.style.cursor = 'default';
            }
        });

        // Keep the existing click handler
        d3.select(this.canvas).on('click', (event) => {
            if (this.dragging) return; // Ignore clicks during drag operations
            
            const point = d3.pointer(event, this.canvas);
            const simPoint = this.transformPointToSimulation(point);
            const clickedNode = this.findNodeAtPoint(simPoint.x, simPoint.y);
            
            if (clickedNode) {
                // If clicked on a node, select it and show info box
                this.selectedNode = clickedNode;
                this.infoBox.visible = true;
                
                // Calculate screen position of the node
                const nodeScreenX = clickedNode.x * this.transform.k + this.transform.x;
                const nodeScreenY = clickedNode.y * this.transform.k + this.transform.y;
                
                // Get canvas dimensions
                const canvasWidth = this.canvas.width;
                const canvasHeight = this.canvas.height;
                
                // Position the info box - prefer right of node but ensure it stays on screen
                const nodeRadius = this.config.nodeRadius * this.transform.k;
                
                // Start with position to the right and aligned with node top
                let boxX = nodeScreenX + nodeRadius + 10; 
                let boxY = nodeScreenY - nodeRadius;
                
                // Make sure box stays within horizontal bounds
                if (boxX + this.infoBox.width > canvasWidth - 10) {
                    // Not enough room on the right, try left side
                    boxX = nodeScreenX - this.infoBox.width - nodeRadius - 10;
                }
                
                // If still out of bounds (very large node or at edge), center horizontally
                if (boxX < 10) {
                    boxX = 10;
                }
                
                // Make sure box stays within vertical bounds
                if (boxY < 10) {
                    boxY = 10;
                }
                
                // Check if box would extend below canvas
                // We need to estimate height first, assuming ~4 properties plus label
                const estimatedHeight = this.infoBox.padding * 2 + (5 * 24) + 36; // header + ~5 lines
                if (boxY + estimatedHeight > canvasHeight - 10) {
                    // Position box above if it would go below canvas
                    boxY = Math.max(10, canvasHeight - estimatedHeight - 10);
                }
                
                this.infoBox.x = boxX;
                this.infoBox.y = boxY;
            } else {
                // If clicked elsewhere, deselect and hide info box
                this.selectedNode = null;
                this.infoBox.visible = false;
            }
            
            this.draw();
        });
    }

    // New method to draw info box
    drawInfoBox() {
        const ctx = this.ctx;
        const node = this.selectedNode;
        const box = this.infoBox;
        const padding = box.padding;
        
        // Get properties to display
        const properties = node.properties || {};
        const propertyLines = [];
        
        // Add node ID and label
        propertyLines.push(`ID: ${node.id}`);
        propertyLines.push(`Label: ${node.label || ''}`);
        
        // Add all properties
        for (const key in properties) {
            if (key !== 'type') { // Skip type as it's usually displayed as part of the node color
                propertyLines.push(`${key}: ${properties[key]}`);
            }
        }
        
        // Add relationship info if available
        if (node.relationship_name) {
            propertyLines.push(`Relationship: ${node.relationship_name}`);
        }
        
        // Calculate box height based on content
        const lineHeight = 24;
        box.height = padding * 2 + propertyLines.length * lineHeight + 36; // Add header height
        
        // Draw in screen coordinates - save current transformation
        ctx.save();
        
        // Reset transformation to draw in screen space
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        
        // Draw shadow
        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetX = 3;
        ctx.shadowOffsetY = 3;
        
        // Draw white background with border
        ctx.fillStyle = 'white';
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(box.x, box.y, box.width, box.height, 8); // Using roundRect for rounded corners
        ctx.fill();
        ctx.stroke();
        
        // Reset shadow
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        
        // Draw title bar
        const nodeType = node.properties && node.properties.type ? node.properties.type : 'Node';
        ctx.fillStyle = node.color || '#666666';
        ctx.beginPath();
        ctx.roundRect(box.x, box.y, box.width, 36, { upperLeft: 8, upperRight: 8, lowerLeft: 0, lowerRight: 0 });
        ctx.fill();
        
        // Draw title text
        ctx.fillStyle = 'white';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(nodeType, box.x + padding, box.y + 18);
        
        // Draw property lines
        ctx.fillStyle = '#333333';
        ctx.font = '14px Arial';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        
        propertyLines.forEach((line, index) => {
            ctx.fillText(line, box.x + padding, box.y + padding + 36 + (index * lineHeight));
        });
        
        ctx.restore();
    }
}
