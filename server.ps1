# Service Request Backend Server
# Listens on http://localhost:8786/send and handles incoming service requests

# Define the endpoint
$endpoint = "http://localhost:8786/send"

# Create HTTP listener
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add($endpoint)
$listener.Start()

Write-Host "Service Request Server started on $endpoint" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow

try {
    while ($listener.IsListening) {
        # Wait for incoming request
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        # Handle only POST requests to /send
        if ($request.HttpMethod -eq 'POST' -and $request.Url.AbsolutePath -eq '/send') {
            try {
                # Read request body
                $stream = $request.InputStream
                $reader = [System.IO.StreamReader]::new($stream)
                $body = $reader.ReadToEnd()

                # Parse JSON
                $data = $body | ConvertFrom-Json

                if ($data -and $data.phone -and $data.service) {
                    $phone = $data.phone.Trim()
                    $service = $data.service.Trim()

                    # Log the request
                    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
                    Write-Host "[$timestamp] Received request: Service='$service', Phone='$phone'" -ForegroundColor Cyan

                    # Simulate WhatsApp integration (placeholder)
                    # In a real implementation, this would interface with WhatsApp Web/Digital API
                    $whatsappResult = Send-WhatsAppNotification -Phone $phone -Service $service

                    # Prepare response
                    if ($whatsappResult) {
                        $responseData = @{
                            status = "success"
                            message = "Request received and WhatsApp notification sent"
                        }
                        $response.StatusCode = 200
                        Write-Host "[$timestamp] WhatsApp notification sent successfully for $service to $phone" -ForegroundColor Green
                    } else {
                        $responseData = @{
                            status = "error"
                            message = "Failed to send WhatsApp notification"
                        }
                        $response.StatusCode = 500
                        Write-Host "[$timestamp] Failed to send WhatsApp notification for $service to $phone" -ForegroundColor Red
                    }
                } else {
                    $responseData = @{
                        status = "error"
                        message = "Invalid request data"
                    }
                    $response.StatusCode = 400
                    Write-Host "[$timestamp] Invalid request data received" -ForegroundColor Yellow
                }

                # Send response
                $response.ContentType = "application/json"
                $responseJson = $responseData | ConvertTo-Json
                $buffer = [System.Text.Encoding]::UTF8.GetBytes($responseJson)
                $response.ContentLength64 = $buffer.Length
                $response.OutputStream.Write($buffer, 0, $buffer.Length)
                $response.Close()

            } catch {
                # Handle errors
                $responseData = @{
                    status = "error"
                    message = "Internal server error"
                }
                $response.StatusCode = 500
                $response.ContentType = "application/json"
                $responseJson = $responseData | ConvertTo-Json
                $buffer = [System.Text.Encoding]::UTF8.GetBytes($responseJson)
                $response.ContentLength64 = $buffer.Length
                $response.OutputStream.Write($buffer, 0, $buffer.Length)
                $response.Close()

                Write-Host "Error processing request: $_" -ForegroundColor Red
            }
        } else {
            # Handle other requests (GET, etc.) with 404
            $response.StatusCode = 404
            $response.StatusDescription = "Not Found"
            $response.Close()
        }
    }
} finally {
    $listener.Stop()
    $listener.Close()
}

function Send-WhatsAppNotification {
    param(
        [string]$Phone,
        [string]$Service
    )

    try {
        # This is a placeholder for actual WhatsApp integration
        # In a real implementation, you would:
        # 1. Connect to WhatsApp Web or use WhatsApp Business API
        # 2. Find or create chat with the phone number
        # 3. Send the automated opening message

        $openingMessage = "Hi! We received your request for [$Service] from our website."

        # For now, we'll just log what would be sent
        Write-Host "Would send WhatsApp message to $Phone: '$openingMessage'" -ForegroundColor DarkCyan

        # Simulate some processing time
        Start-Sleep -Milliseconds 500

        # Return success (in real implementation, this would depend on actual WhatsApp send result)
        return $true
    } catch {
        Write-Host "Error sending WhatsApp notification: $_" -ForegroundColor Red
        return $false
    }
}