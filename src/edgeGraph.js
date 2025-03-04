class EdgeGraph {
    constructor(container, data) {
        this.container = container;
        this.data = data;
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        
        // Configuration constants
        this.config = {
            nodeRadius: 60,
            arrowLength: 15,
            arrowWidth: Math.PI / 12,
            lineWidth: 1.5,
            font: '14px Arial',
            boldFont: 'bold 14px Arial',
            lineHeight: 16,
            bidirectionalOffset: 15,
            textOffset: 6,
            edgePadding: 40,
            viewPadding: 60
        };
        
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

        // Setup force simulation with adjusted parameters for more spacing
        this.simulation = d3.forceSimulation(this.nodes)
            .force('link', d3.forceLink(this.links)
                .id(d => d.id)
                .distance(350))  // Increased from 250 to 350
            .force('charge', d3.forceManyBody()
                .strength(-1000)  // Increased from -600 to -1000
                .distanceMax(500))  // Increased from 350 to 500
            .force('collide', d3.forceCollide()
                .radius(this.config.nodeRadius * 1.5)  // Increased from 1.05 to 1.5
                .strength(0.8)  // Increased from 0.7 to 0.8
                .iterations(3))  // Increased from 2 to 3
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
        this.ctx.save();
        this.applyTransform();
        
        this.drawLinks();
        this.drawNodes();
        
        this.ctx.restore();
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
            // Transform mouse coordinates to simulation space
            const point = this.transformPointToSimulation(d3.pointer(event, this.canvas));
            
            // Find node under cursor
            return this.findNodeAtPoint(point.x, point.y);
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
        
        this.draggedNode = event.subject;
        this.dragging = true;
        
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
        
        // Keep node fixed at its current position instead of releasing it
        // this.draggedNode.fx = null;
        // this.draggedNode.fy = null;
        
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
                // Allow zoom only when not dragging and using wheel/pinch
                return !this.dragging && (event.type === 'wheel' || event.type === 'touchmove');
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
        // Calculate bounds
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        
        this.nodes.forEach(node => {
            if (node.x == null || node.y == null) return;
            const radius = this.config.nodeRadius; // Node radius
            minX = Math.min(minX, node.x - radius);
            maxX = Math.max(maxX, node.x + radius);
            minY = Math.min(minY, node.y - radius);
            maxY = Math.max(maxY, node.y + radius);
        });

        // Add consistent padding
        const edgePadding = this.config.edgePadding;
        const viewPadding = this.config.viewPadding;
        
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
                node.x += dirX * overlap * repulsionStrength;
                node.y += dirY * overlap * repulsionStrength;
                
                // Ensure other nodes remain within bounds and have consistent physics
                // Even after we push them away
                if (node.fx === null && node.fy === null) {
                    // Only apply velocity if the node isn't fixed
                    const velocityDamping = 0.5; // Dampen velocity for smoother movement
                    if (!node.vx) node.vx = 0;
                    if (!node.vy) node.vy = 0;
                    node.vx += dirX * overlap * repulsionStrength * velocityDamping;
                    node.vy += dirY * overlap * repulsionStrength * velocityDamping;
                }
            }
        });
    }
}
