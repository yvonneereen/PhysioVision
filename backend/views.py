from django.db import connection
from django.http import JsonResponse
from django.views.decorators.http import require_GET


@require_GET
def health_check(request):
    """Confirm that both Django and its configured database are reachable."""
    with connection.cursor() as cursor:
        cursor.execute('SELECT 1')
        cursor.fetchone()

    return JsonResponse({'status': 'ok', 'database': 'reachable'})
